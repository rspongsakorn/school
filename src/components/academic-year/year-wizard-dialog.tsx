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
import { createYearWithSemesters } from "@/lib/actions/academic-years";
import { defaultSemesterDates } from "@/lib/academic-year/semester-dates";
import { isSemesterOutsideYear } from "@/lib/academic-year/validation";

type SemesterDraft = {
  startDate: string;
  endDate: string;
  name: string;
};

type YearWizardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const initialYear = {
  name: "",
  startDate: "",
  endDate: "",
  isActive: false,
};

const initialSemester = {
  startDate: "",
  endDate: "",
  name: "",
};

export function YearWizardDialog({ open, onOpenChange }: YearWizardDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [year, setYear] = useState(initialYear);
  const [semester1, setSemester1] = useState<SemesterDraft>(initialSemester);
  const [yearErrors, setYearErrors] = useState<YearFormErrors>({});
  const [sem1Errors, setSem1Errors] = useState<SemesterFormErrors>({});

  const currentSemesterWarning = useMemo(() => {
    if (step === 1 || !year.startDate || !year.endDate) return false;
    if (!semester1.startDate || !semester1.endDate) return false;
    return isSemesterOutsideYear(
      { start: year.startDate, end: year.endDate },
      { start: semester1.startDate, end: semester1.endDate },
    );
  }, [step, year.startDate, year.endDate, semester1]);

  function resetState() {
    setStep(1);
    setSubmitting(false);
    setYear(initialYear);
    setSemester1(initialSemester);
    setYearErrors({});
    setSem1Errors({});
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) resetState();
  }

  function goStep2() {
    const validation = validateYearForm(year);
    if (!validation.ok) {
      setYearErrors(validation.errors);
      return;
    }

    setYearErrors({});
    const defaults = defaultSemesterDates(year.startDate, year.endDate);
    setSemester1((prev) => ({
      ...prev,
      startDate: defaults.semester1.start,
      endDate: defaults.semester1.end,
    }));
    setStep(2);
  }

  async function handleSubmit() {
    const validation = validateSemesterForm(semester1, 1);
    if (!validation.ok) {
      setSem1Errors(validation.errors);
      return;
    }

    setSem1Errors({});
    setSubmitting(true);
    try {
      const result = await createYearWithSemesters(
        {
          name: year.name,
          startDate: year.startDate,
          endDate: year.endDate,
          isActive: year.isActive,
        },
        [
          {
            number: 1,
            startDate: semester1.startDate,
            endDate: semester1.endDate,
            name: semester1.name,
          },
        ],
      );

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("เพิ่มปีการศึกษาเรียบร้อยแล้ว");
      router.refresh();
      handleOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>เพิ่มปีการศึกษา</DialogTitle>
          <DialogDescription>
            ขั้นตอนที่ {step} จาก 2{" "}
            {step === 1 ? "ข้อมูลปีการศึกษา" : "ภาคเรียนแรก (เพิ่มภาคอื่นได้ภายหลัง)"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {step === 1 ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="create-year-name">ชื่อปีการศึกษา</Label>
                <Input
                  id="create-year-name"
                  placeholder="เช่น 2569"
                  value={year.name}
                  onChange={(e) => setYear((prev) => ({ ...prev, name: e.target.value }))}
                  aria-invalid={Boolean(yearErrors.name)}
                />
                <FieldError message={yearErrors.name} />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="create-year-start">วันที่เริ่ม</Label>
                  <Input
                    id="create-year-start"
                    type="date"
                    value={year.startDate}
                    onChange={(e) => setYear((prev) => ({ ...prev, startDate: e.target.value }))}
                    aria-invalid={Boolean(yearErrors.startDate)}
                  />
                  <FieldError message={yearErrors.startDate} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-year-end">วันที่สิ้นสุด</Label>
                  <Input
                    id="create-year-end"
                    type="date"
                    value={year.endDate}
                    onChange={(e) => setYear((prev) => ({ ...prev, endDate: e.target.value }))}
                    aria-invalid={Boolean(yearErrors.endDate)}
                  />
                  <FieldError message={yearErrors.endDate} />
                </div>
              </div>
              <Label htmlFor="create-year-active" className="w-fit gap-3">
                <input
                  id="create-year-active"
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={year.isActive}
                  onChange={(e) => setYear((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                ตั้งค่าเป็นปีการศึกษาปัจจุบัน
              </Label>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="create-sem1-name">ชื่อภาคเรียนที่ 1 (ไม่บังคับ)</Label>
                <Input
                  id="create-sem1-name"
                  placeholder="เช่น ภาคต้น"
                  value={semester1.name}
                  onChange={(e) => setSemester1((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="create-sem1-start">วันที่เริ่มภาคเรียนที่ 1</Label>
                  <Input
                    id="create-sem1-start"
                    type="date"
                    value={semester1.startDate}
                    onChange={(e) =>
                      setSemester1((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    aria-invalid={Boolean(sem1Errors.startDate)}
                  />
                  <FieldError message={sem1Errors.startDate} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="create-sem1-end">วันที่สิ้นสุดภาคเรียนที่ 1</Label>
                  <Input
                    id="create-sem1-end"
                    type="date"
                    value={semester1.endDate}
                    onChange={(e) =>
                      setSemester1((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    aria-invalid={Boolean(sem1Errors.endDate)}
                  />
                  <FieldError message={sem1Errors.endDate} />
                </div>
              </div>
            </>
          )}

          {currentSemesterWarning ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              ช่วงวันที่ภาคเรียนอยู่นอกช่วงปีการศึกษา ระบบยังบันทึกได้ แต่ควรตรวจสอบอีกครั้ง
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              ย้อนกลับ
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            ยกเลิก
          </Button>
          {step < 2 ? (
            <Button type="button" onClick={goStep2} disabled={submitting}>
              ถัดไป
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "บันทึกปีการศึกษา"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
