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
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  validateSemesterForm,
  validateYearForm,
  type SemesterFormErrors,
  type YearFormErrors,
} from "@/lib/academic-year/form-validation";
import { defaultSemesterDates } from "@/lib/academic-year/semester-dates";
import { isSemesterOutsideYear } from "@/lib/academic-year/validation";
import { updateYearWithSemesters } from "@/lib/actions/academic-years";
import type { AcademicYearRow } from "@/lib/data/academic-years";

type SemesterDraft = {
  startDate: string;
  endDate: string;
  name: string;
};

type YearEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: AcademicYearRow | null;
};

function buildEditState(year: AcademicYearRow) {
  const defaults = defaultSemesterDates(year.start_date, year.end_date);
  const sem1 = year.semesters.find((s) => s.number === 1);
  const sem2 = year.semesters.find((s) => s.number === 2);

  return {
    yearState: {
      name: year.name,
      startDate: year.start_date,
      endDate: year.end_date,
      isActive: year.is_active,
    },
    semester1: {
      startDate: sem1?.start_date ?? defaults.semester1.start,
      endDate: sem1?.end_date ?? defaults.semester1.end,
      name: sem1?.name ?? "",
    },
    semester2: {
      startDate: sem2?.start_date ?? defaults.semester2.start,
      endDate: sem2?.end_date ?? defaults.semester2.end,
      name: sem2?.name ?? "",
    },
  };
}

export function YearEditDialog({ open, onOpenChange, year }: YearEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {year && open ? (
          <YearEditForm key={year.id} year={year} onOpenChange={onOpenChange} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>แก้ไขปีการศึกษา</DialogTitle>
              <DialogDescription>ปรับข้อมูลปีการศึกษาและภาคเรียนทั้ง 2 ภาค</DialogDescription>
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
  const initialState = buildEditState(year);
  const [submitting, setSubmitting] = useState(false);
  const [yearState, setYearState] = useState(initialState.yearState);
  const [semester1, setSemester1] = useState<SemesterDraft>(initialState.semester1);
  const [semester2, setSemester2] = useState<SemesterDraft>(initialState.semester2);
  const [yearErrors, setYearErrors] = useState<YearFormErrors>({});
  const [sem1Errors, setSem1Errors] = useState<SemesterFormErrors>({});
  const [sem2Errors, setSem2Errors] = useState<SemesterFormErrors>({});

  const sem1OutsideYear = useMemo(() => {
    if (!yearState.startDate || !yearState.endDate) return false;
    if (!semester1.startDate || !semester1.endDate) return false;
    return isSemesterOutsideYear(
      { start: yearState.startDate, end: yearState.endDate },
      { start: semester1.startDate, end: semester1.endDate },
    );
  }, [semester1.endDate, semester1.startDate, yearState.endDate, yearState.startDate]);

  const sem2OutsideYear = useMemo(() => {
    if (!yearState.startDate || !yearState.endDate) return false;
    if (!semester2.startDate || !semester2.endDate) return false;
    return isSemesterOutsideYear(
      { start: yearState.startDate, end: yearState.endDate },
      { start: semester2.startDate, end: semester2.endDate },
    );
  }, [semester2.endDate, semester2.startDate, yearState.endDate, yearState.startDate]);

  function closeDialog() {
    if (submitting) return;
    onOpenChange(false);
  }

  function updateYearField<Key extends keyof typeof yearState>(
    key: Key,
    value: (typeof yearState)[Key],
  ) {
    setYearState((prev) => ({ ...prev, [key]: value }));
    if (key in yearErrors) {
      setYearErrors((prev) => {
        const next = { ...prev };
        delete next[key as keyof YearFormErrors];
        return next;
      });
    }
  }

  function updateSem1Field<Key extends keyof SemesterDraft>(key: Key, value: SemesterDraft[Key]) {
    setSemester1((prev) => ({ ...prev, [key]: value }));
    if (key === "startDate" || key === "endDate") {
      setSem1Errors((prev) => {
        const next = { ...prev };
        delete next[key as keyof SemesterFormErrors];
        return next;
      });
    }
  }

  function updateSem2Field<Key extends keyof SemesterDraft>(key: Key, value: SemesterDraft[Key]) {
    setSemester2((prev) => ({ ...prev, [key]: value }));
    if (key === "startDate" || key === "endDate") {
      setSem2Errors((prev) => {
        const next = { ...prev };
        delete next[key as keyof SemesterFormErrors];
        return next;
      });
    }
  }

  async function handleSubmit() {
    const yearValidation = validateYearForm(yearState);
    if (!yearValidation.ok) {
      setYearErrors(yearValidation.errors);
    }

    const sem1Validation = validateSemesterForm(semester1, 1);
    if (!sem1Validation.ok) {
      setSem1Errors(sem1Validation.errors);
    }

    const sem2Validation = validateSemesterForm(semester2, 2);
    if (!sem2Validation.ok) {
      setSem2Errors(sem2Validation.errors);
    }

    if (!yearValidation.ok || !sem1Validation.ok || !sem2Validation.ok) {
      return;
    }

    setYearErrors({});
    setSem1Errors({});
    setSem2Errors({});
    setSubmitting(true);
    try {
      const result = await updateYearWithSemesters(
        year.id,
        {
          name: yearState.name,
          startDate: yearState.startDate,
          endDate: yearState.endDate,
          isActive: yearState.isActive,
        },
        [
          {
            number: 1,
            startDate: semester1.startDate,
            endDate: semester1.endDate,
            name: semester1.name,
          },
          {
            number: 2,
            startDate: semester2.startDate,
            endDate: semester2.endDate,
            name: semester2.name,
          },
        ],
      );

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("บันทึกการแก้ไขปีการศึกษาเรียบร้อยแล้ว");
      router.refresh();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>แก้ไขปีการศึกษา</DialogTitle>
        <DialogDescription>ปรับข้อมูลปีการศึกษาและภาคเรียนทั้ง 2 ภาค</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 py-1">
        <div className="grid gap-3 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">ข้อมูลปีการศึกษา</p>
          <div className="grid gap-2">
            <Label htmlFor="edit-year-name">ชื่อปีการศึกษา</Label>
            <Input
              id="edit-year-name"
              value={yearState.name}
              onChange={(e) => updateYearField("name", e.target.value)}
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
                onChange={(e) => updateYearField("startDate", e.target.value)}
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
                onChange={(e) => updateYearField("endDate", e.target.value)}
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
              onChange={(e) => {
                const isActive = e.target.checked;
                setYearState((prev) => ({ ...prev, isActive }));
              }}
            />
            ตั้งค่าเป็นปีการศึกษาปัจจุบัน
          </Label>
        </div>

        <div className="grid gap-3 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">ภาคเรียนที่ 1</p>
          <div className="grid gap-2">
            <Label htmlFor="edit-sem1-name">ชื่อภาคเรียน (ไม่บังคับ)</Label>
            <Input
              id="edit-sem1-name"
              value={semester1.name}
              onChange={(e) => updateSem1Field("name", e.target.value)}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-sem1-start">วันที่เริ่ม</Label>
              <Input
                id="edit-sem1-start"
                type="date"
                value={semester1.startDate}
                onChange={(e) => updateSem1Field("startDate", e.target.value)}
                aria-invalid={Boolean(sem1Errors.startDate)}
              />
              <FieldError message={sem1Errors.startDate} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-sem1-end">วันที่สิ้นสุด</Label>
              <Input
                id="edit-sem1-end"
                type="date"
                value={semester1.endDate}
                onChange={(e) => updateSem1Field("endDate", e.target.value)}
                aria-invalid={Boolean(sem1Errors.endDate)}
              />
              <FieldError message={sem1Errors.endDate} />
            </div>
          </div>
          {sem1OutsideYear ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              วันที่ภาคเรียนที่ 1 อยู่นอกช่วงปีการศึกษา (แจ้งเตือนเท่านั้น)
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">ภาคเรียนที่ 2</p>
          <div className="grid gap-2">
            <Label htmlFor="edit-sem2-name">ชื่อภาคเรียน (ไม่บังคับ)</Label>
            <Input
              id="edit-sem2-name"
              value={semester2.name}
              onChange={(e) => updateSem2Field("name", e.target.value)}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-sem2-start">วันที่เริ่ม</Label>
              <Input
                id="edit-sem2-start"
                type="date"
                value={semester2.startDate}
                onChange={(e) => updateSem2Field("startDate", e.target.value)}
                aria-invalid={Boolean(sem2Errors.startDate)}
              />
              <FieldError message={sem2Errors.startDate} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-sem2-end">วันที่สิ้นสุด</Label>
              <Input
                id="edit-sem2-end"
                type="date"
                value={semester2.endDate}
                onChange={(e) => updateSem2Field("endDate", e.target.value)}
                aria-invalid={Boolean(sem2Errors.endDate)}
              />
              <FieldError message={sem2Errors.endDate} />
            </div>
          </div>
          {sem2OutsideYear ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              วันที่ภาคเรียนที่ 2 อยู่นอกช่วงปีการศึกษา (แจ้งเตือนเท่านั้น)
            </div>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={closeDialog}>
          ยกเลิก
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </Button>
      </DialogFooter>
    </>
  );
}
