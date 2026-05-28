"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateInvoices } from "@/lib/actions/invoices";
import type { InvoiceCandidateRow } from "@/lib/data/invoices";
import type { FeeItemRow } from "@/lib/data/fee-items";

type InvoiceGenerateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: string;
  academicYearId: string;
  academicYearName: string;
  semesterNumber: number;
  feeItems: FeeItemRow[];
  candidates: InvoiceCandidateRow[];
};

export function InvoiceGenerateDialog({
  open,
  onOpenChange,
  semesterId,
  academicYearId,
  academicYearName,
  semesterNumber,
  feeItems,
  candidates,
}: InvoiceGenerateDialogProps) {
  const router = useRouter();
  const activeItems = feeItems.filter((i) => i.isActive);
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selectedFeeItemIds, setSelectedFeeItemIds] = useState<Set<string>>(
    () => new Set(activeItems.map((i) => i.id)),
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [reimbursableStudentIds, setReimbursableStudentIds] = useState<Set<string>>(new Set());

  const selectableCandidates = useMemo(
    () => candidates.filter((c) => !c.hasInvoice),
    [candidates],
  );

  function toggleFeeItem(id: string) {
    setSelectedFeeItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleStudent(id: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllStudents() {
    setSelectedStudentIds(new Set(selectableCandidates.map((c) => c.studentId)));
  }

  function toggleReimbursable(id: string) {
    setReimbursableStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAllReimbursable(value: boolean) {
    if (!value) {
      setReimbursableStudentIds(new Set());
      return;
    }
    if (mode === "selected") {
      setReimbursableStudentIds(new Set(selectedStudentIds));
    } else {
      setReimbursableStudentIds(
        new Set(selectableCandidates.map((c) => c.studentId)),
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const feeItemIds = [...selectedFeeItemIds];
    if (feeItemIds.length === 0) {
      toast.error("กรุณาเลือกรายการค่าใช้จ่าย");
      return;
    }

    const studentIds =
      mode === "selected" ? [...selectedStudentIds] : undefined;

    if (mode === "selected" && studentIds && studentIds.length === 0) {
      toast.error("กรุณาเลือกนักเรียนอย่างน้อย 1 คน");
      return;
    }

    setSubmitting(true);
    const result = await generateInvoices({
      semesterId,
      academicYearId,
      academicYearName,
      semesterNumber,
      feeItemIds,
      studentIds,
      reimbursableStudentIds: [...reimbursableStudentIds],
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`สร้างใบแจ้ง ${result.created} รายการ (ข้าม ${result.skipped})`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>สร้างใบแจ้งชำระ</DialogTitle>
            <DialogDescription>
              ภาคเรียนที่ {semesterNumber} / {academicYearName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>โหมด</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "all" | "selected")}
                items={[
                  { value: "all", label: "ทั้งภาค (นักเรียนที่ลงทะเบียน)" },
                  { value: "selected", label: "เลือกเฉพาะรายชื่อ" },
                ]}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งภาค (นักเรียนที่ลงทะเบียน)</SelectItem>
                  <SelectItem value="selected">เลือกเฉพาะรายชื่อ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>รายการค่าใช้จ่าย</Label>
              <div className="max-h-32 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                {activeItems.map((item) => (
                  <Label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                  >
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border accent-primary"
                      checked={selectedFeeItemIds.has(item.id)}
                      onChange={() => toggleFeeItem(item.id)}
                    />
                    {item.name}
                  </Label>
                ))}
              </div>
            </div>

            {mode === "selected" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>นักเรียน (ยังไม่มีใบ)</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={selectAllStudents}>
                      เลือกทั้งหมด
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAllReimbursable(true)}>
                      ตั้งเบิกได้ทุกคน
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAllReimbursable(false)}>
                      ล้างเบิกได้
                    </Button>
                  </div>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                  {selectableCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ไม่มีนักเรียนที่สร้างใบได้</p>
                  ) : (
                    selectableCandidates.map((c) => (
                      <div
                        key={c.studentId}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <Label className="flex cursor-pointer items-center gap-2 font-normal">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-border accent-primary"
                            checked={selectedStudentIds.has(c.studentId)}
                            onChange={() => toggleStudent(c.studentId)}
                          />
                          <span className="tabular-nums">{c.studentCode}</span>
                          <span>{c.studentName}</span>
                          <span className="text-muted-foreground">({c.gradeClassroom})</span>
                        </Label>
                        <Label className="flex cursor-pointer items-center gap-1 text-xs text-sky-700">
                          <input
                            type="checkbox"
                            className="size-3.5 rounded border-border accent-sky-600"
                            checked={reimbursableStudentIds.has(c.studentId)}
                            onChange={() => toggleReimbursable(c.studentId)}
                          />
                          เบิกได้
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>ระบุ &quot;เบิกได้&quot; ในโหมดทั้งภาค</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setAllReimbursable(true)}>
                      ตั้งเบิกได้ทุกคน
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAllReimbursable(false)}>
                      ล้างเบิกได้
                    </Button>
                  </div>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                  {selectableCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ไม่มีนักเรียนที่สร้างใบได้</p>
                  ) : (
                    selectableCandidates.map((c) => (
                      <Label
                        key={c.studentId}
                        className="flex cursor-pointer items-center justify-between gap-2 text-sm font-normal"
                      >
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{c.studentCode}</span>
                          <span>{c.studentName}</span>
                          <span className="text-muted-foreground">({c.gradeClassroom})</span>
                        </span>
                        <span className="flex items-center gap-1 text-xs text-sky-700">
                          <input
                            type="checkbox"
                            className="size-3.5 rounded border-border accent-sky-600"
                            checked={reimbursableStudentIds.has(c.studentId)}
                            onChange={() => toggleReimbursable(c.studentId)}
                          />
                          เบิกได้
                        </span>
                      </Label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "กำลังสร้าง..." : "สร้างใบแจ้ง"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
