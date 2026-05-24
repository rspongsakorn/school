"use client";

import { useState } from "react";
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
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SemesterListEditor } from "@/components/academic-year/semester-list-editor";
import { updateYearMetadata } from "@/lib/actions/academic-years";
import { validateYearForm, type YearFormErrors } from "@/lib/academic-year/form-validation";
import type { AcademicYearRow } from "@/lib/data/academic-years";

type YearEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: AcademicYearRow | null;
};

export function YearEditDialog({ open, onOpenChange, year }: YearEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {year && open ? (
          <YearEditForm key={year.id} year={year} onOpenChange={onOpenChange} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>แก้ไขปีการศึกษา</DialogTitle>
              <DialogDescription>ปรับข้อมูลปีการศึกษาและภาคเรียน</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                ยกเลิก
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function YearEditForm({
  year,
  onOpenChange,
}: {
  year: AcademicYearRow;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [yearState, setYearState] = useState({
    name: year.name,
    startDate: year.start_date,
    endDate: year.end_date,
    isActive: year.is_active,
  });
  const [yearErrors, setYearErrors] = useState<YearFormErrors>({});

  async function handleSaveYear() {
    const validation = validateYearForm(yearState);
    if (!validation.ok) {
      setYearErrors(validation.errors);
      return;
    }

    setYearErrors({});
    setSubmitting(true);
    const result = await updateYearMetadata(year.id, {
      name: yearState.name,
      startDate: yearState.startDate,
      endDate: yearState.endDate,
      isActive: yearState.isActive,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("บันทึกข้อมูลปีการศึกษาแล้ว");
    router.refresh();
    onOpenChange(false);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>แก้ไขปีการศึกษา</DialogTitle>
        <DialogDescription>
          ปรับข้อมูลปีการศึกษาและจัดการภาคเรียน (เพิ่ม/ลบภาคได้ที่ด้านล่าง)
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 py-1">
        <div className="grid gap-3 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">ข้อมูลปีการศึกษา</p>
          <div className="grid gap-2">
            <Label htmlFor="edit-year-name">ชื่อปีการศึกษา</Label>
            <Input
              id="edit-year-name"
              value={yearState.name}
              onChange={(e) => setYearState((prev) => ({ ...prev, name: e.target.value }))}
              aria-invalid={Boolean(yearErrors.name)}
            />
            <FieldError message={yearErrors.name} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-year-start">วันที่เริ่ม</Label>
              <Input
                id="edit-year-start"
                type="date"
                value={yearState.startDate}
                onChange={(e) => setYearState((prev) => ({ ...prev, startDate: e.target.value }))}
                aria-invalid={Boolean(yearErrors.startDate)}
              />
              <FieldError message={yearErrors.startDate} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-year-end">วันที่สิ้นสุด</Label>
              <Input
                id="edit-year-end"
                type="date"
                value={yearState.endDate}
                onChange={(e) => setYearState((prev) => ({ ...prev, endDate: e.target.value }))}
                aria-invalid={Boolean(yearErrors.endDate)}
              />
              <FieldError message={yearErrors.endDate} />
            </div>
          </div>
          <Label htmlFor="edit-year-active" className="w-fit gap-3">
            <input
              id="edit-year-active"
              type="checkbox"
              className="size-4 rounded border-border accent-primary"
              checked={yearState.isActive}
              onChange={(e) =>
                setYearState((prev) => ({ ...prev, isActive: e.target.checked }))
              }
            />
            ตั้งค่าเป็นปีการศึกษาปัจจุบัน
          </Label>
        </div>

        <SemesterListEditor year={year} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          ยกเลิก
        </Button>
        <Button type="button" onClick={handleSaveYear} disabled={submitting}>
          {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูลปี"}
        </Button>
      </DialogFooter>
    </>
  );
}
