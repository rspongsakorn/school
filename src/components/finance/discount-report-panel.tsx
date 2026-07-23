"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht } from "@/lib/format";
import { fetchDiscountReport } from "@/lib/queries/reports";
import { Card, CardContent } from "@/components/ui/card";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DiscountReportPanel() {
  useRequireRole(["admin", "finance"]);
  const { ctx } = useSemesterContext();
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["discount-report", ctx?.academicYearId, dateFrom, dateTo],
    queryFn: () =>
      fetchDiscountReport({
        academicYearId: ctx!.academicYearId,
        dateFrom,
        dateTo,
      }),
    enabled: !!ctx,
  });

  const rows = data?.rows ?? [];
  const grandTotal = data?.grandTotal ?? 0;

  return (
    <>
      <AppHeader title="รายงานส่วนลด" basePath="/reports/discounts" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead
          title="รายงานส่วนลด"
          yearName={ctx?.academicYearName}
          semesterNumber={ctx?.semesterNumber}
          subtitle={`ช่วงวันที่ ${dateFrom} ถึง ${dateTo}`}
        />
        <Card className="border-border shadow-sm">
        <CardContent className="space-y-4">
          <div className="report-toolbar flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">ตั้งแต่</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ถึง</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="ml-auto">
              <ReportToolbar />
            </div>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              ไม่มีส่วนลดในช่วงที่เลือก
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รายการค่าใช้จ่าย</TableHead>
                  <TableHead className="text-right">จำนวนครั้ง</TableHead>
                  <TableHead className="text-right">ยอดส่วนลดรวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.feeItemId}>
                    <TableCell className="font-medium">{row.feeItemName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBaht(row.totalDiscount)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>รวมทั้งช่วง</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">
                    {formatBaht(grandTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
        </Card>
      </main>
    </>
  );
}
