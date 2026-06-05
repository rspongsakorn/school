"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  firstSemesterFormError,
  validateSemesterForm,
  type SemesterFormErrors,
} from "@/lib/academic-year/form-validation";
import { nextSemesterDefaultDates } from "@/lib/academic-year/semester-dates";
import { addSemester, updateSemester } from "@/lib/actions/semesters";
import type { SemesterRow } from "@/lib/data/academic-years";

export type SemesterDialogInitial = {
  id: string;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
};

type SemesterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  academicYearId: string;
  yearStartDate: string;
  yearEndDate: string;
  existingSemesters: SemesterRow[];
  initial?: SemesterDialogInitial;
};

export function SemesterDialog({
  open,
  onOpenChange,
  mode,
  academicYearId,
  yearStartDate,
  yearEndDate,
  existingSemesters,
  initial,
}: SemesterDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<SemesterFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const nextSemesterNumber =
    existingSemesters.reduce((max, s) => Math.max(max, s.number), 0) + 1;
  const semesterNumber = mode === "edit" ? initial!.number : nextSemesterNumber;

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && initial) {
      setName(initial.name);
      setStartDate(initial.startDate);
      setEndDate(initial.endDate);
    } else {
      const defaults = nextSemesterDefaultDates(yearStartDate, yearEndDate, existingSemesters);
      setName("");
      setStartDate(defaults.start);
      setEndDate(defaults.end);
    }
    setErrors({});
  }, [open, mode, initial, yearStartDate, yearEndDate, existingSemesters]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateSemesterForm({ startDate, endDate }, semesterNumber);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    const result =
      mode === "create"
        ? await addSemester(academicYearId, { name, startDate, endDate })
        : await updateSemester(initial!.id, { name, startDate, endDate });

    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "เพิ่มภาคเรียนแล้ว" : "บันทึกภาคเรียนแล้ว");
    onOpenChange(false);
    void queryClient.invalidateQueries({ queryKey: ["academic-year", academicYearId] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "เพิ่มภาคเรียน" : `แก้ไขภาคเรียนที่ ${initial?.number}`}
            </DialogTitle>
            <DialogDescription>กำหนดชื่อและช่วงวันที่ของภาคเรียน</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="semester-dialog-name">ชื่อ (ไม่บังคับ)</Label>
              <Input
                id="semester-dialog-name"
                placeholder="เช่น ภาคต้น"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="semester-dialog-start">วันที่เริ่ม</Label>
                <Input
                  id="semester-dialog-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-invalid={Boolean(errors.startDate)}
                />
                <FieldError message={errors.startDate} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="semester-dialog-end">วันที่สิ้นสุด</Label>
                <Input
                  id="semester-dialog-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-invalid={Boolean(errors.endDate)}
                />
                <FieldError message={errors.endDate} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
