import { isValidDateRange } from "@/lib/academic-year/validation";

export type YearFormInput = {
  name: string;
  startDate: string;
  endDate: string;
};

export type YearFormErrors = Partial<Record<"name" | "startDate" | "endDate", string>>;

export type SemesterFormInput = {
  startDate: string;
  endDate: string;
};

export type SemesterFormErrors = Partial<Record<"startDate" | "endDate", string>>;

export function validateYearForm(
  input: YearFormInput,
): { ok: true } | { ok: false; errors: YearFormErrors } {
  const errors: YearFormErrors = {};

  if (!input.name.trim()) {
    errors.name = "กรุณากรอกชื่อปีการศึกษา";
  }
  if (!input.startDate) {
    errors.startDate = "กรุณากรอกวันที่เริ่ม";
  }
  if (!input.endDate) {
    errors.endDate = "กรุณากรอกวันที่สิ้นสุด";
  }
  if (input.startDate && input.endDate && !isValidDateRange(input.startDate, input.endDate)) {
    errors.endDate = "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

export function validateSemesterForm(
  input: SemesterFormInput,
  semesterNumber: 1 | 2,
): { ok: true } | { ok: false; errors: SemesterFormErrors } {
  const errors: SemesterFormErrors = {};

  if (!input.startDate) {
    errors.startDate = `กรุณากรอกวันที่เริ่มภาคเรียนที่ ${semesterNumber}`;
  }
  if (!input.endDate) {
    errors.endDate = `กรุณากรอกวันที่สิ้นสุดภาคเรียนที่ ${semesterNumber}`;
  }
  if (
    input.startDate &&
    input.endDate &&
    !isValidDateRange(input.startDate, input.endDate)
  ) {
    errors.endDate = `วันที่ภาคเรียนที่ ${semesterNumber} ไม่ถูกต้อง`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

export function firstYearFormError(errors: YearFormErrors): string {
  return errors.name ?? errors.startDate ?? errors.endDate ?? "ข้อมูลปีการศึกษาไม่ถูกต้อง";
}

export function firstSemesterFormError(errors: SemesterFormErrors): string {
  return errors.startDate ?? errors.endDate ?? "ข้อมูลภาคเรียนไม่ถูกต้อง";
}
