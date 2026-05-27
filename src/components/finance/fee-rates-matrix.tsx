"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { upsertFeeRates, type FeeRateUpsertEntry } from "@/lib/actions/fee-rates";
import { feeRateKey } from "@/lib/finance/fee-rate-keys";
import { formatBaht } from "@/lib/format";
import type { FeeRateMatrix } from "@/lib/data/fee-rates";

type FeeRatesMatrixProps = {
  semesterId: string;
  matrix: FeeRateMatrix;
};

export function FeeRatesMatrix({ semesterId, matrix }: FeeRatesMatrixProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const grade of matrix.grades) {
      for (const item of matrix.items) {
        const key = feeRateKey(grade.id, item.id);
        const amount = matrix.rates[key]?.amount;
        initial[key] = amount != null ? String(amount) : "";
      }
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const hasGrades = matrix.grades.length > 0;
  const hasItems = matrix.items.length > 0;

  const gradeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const grade of matrix.grades) {
      let sum = 0;
      for (const item of matrix.items) {
        const raw = draft[feeRateKey(grade.id, item.id)]?.trim() ?? "";
        const amount = Number.parseFloat(raw);
        if (Number.isFinite(amount) && amount > 0) sum += amount;
      }
      totals[grade.id] = sum;
    }
    return totals;
  }, [draft, matrix]);

  const changedEntries = useMemo(() => {
    const entries: FeeRateUpsertEntry[] = [];
    for (const grade of matrix.grades) {
      for (const item of matrix.items) {
        const key = feeRateKey(grade.id, item.id);
        const raw = draft[key]?.trim() ?? "";
        if (!raw) continue;
        const amount = Number.parseFloat(raw);
        if (!Number.isFinite(amount)) continue;
        const previous = matrix.rates[key]?.amount;
        if (previous === amount) continue;
        entries.push({ gradeLevelId: grade.id, feeItemId: item.id, amount });
      }
    }
    return entries;
  }, [draft, matrix]);

  function updateCell(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (changedEntries.length === 0) {
      toast.message("ไม่มีการเปลี่ยนแปลง");
      return;
    }

    setSaving(true);
    const result = await upsertFeeRates(semesterId, changedEntries);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("บันทึกอัตราค่าธรรมเนียมแล้ว");
    router.refresh();
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">อัตราค่าธรรมเนียมตามชั้น</CardTitle>
          <CardDescription>จำนวนเงิน (บาท) ต่อภาคเรียนที่เลือกใน header</CardDescription>
        </div>
        <Button type="button" onClick={handleSave} disabled={saving || !hasGrades || !hasItems}>
          {saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
        </Button>
      </CardHeader>
      <CardContent>
        {!hasGrades ? (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีชั้นเรียนในภาคนี้ —{" "}
            <Link href="/registration" className="text-primary underline-offset-4 hover:underline">
              ไปตั้งค่าลงทะเบียน
            </Link>
          </p>
        ) : !hasItems ? (
          <p className="text-sm text-muted-foreground">เพิ่มรายการค่าใช้จ่ายด้านบนก่อน</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card">ชั้น</TableHead>
                  {matrix.items.map((item) => (
                    <TableHead key={item.id} className="min-w-[120px] text-right">
                      {item.name}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[120px] text-right text-amber-700">รวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.grades.map((grade) => (
                  <TableRow key={grade.id}>
                    <TableCell className="sticky left-0 bg-card font-medium">{grade.name}</TableCell>
                    {matrix.items.map((item) => {
                      const key = feeRateKey(grade.id, item.id);
                      return (
                        <TableCell key={item.id} className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="ml-auto w-[110px] tabular-nums"
                            value={draft[key] ?? ""}
                            onChange={(e) => updateCell(key, e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-semibold tabular-nums text-amber-700">
                      {gradeTotals[grade.id] > 0 ? formatBaht(gradeTotals[grade.id]) : <span className="text-muted-foreground font-normal">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
