import type { StudentGender, StudentStatus } from "@/lib/students/constants";
import { isFutureIsoDate } from "@/lib/students/dates";

export type StudentFormInput = {
  studentCode: string;
  firstName: string;
  lastName: string;
  idCard: string;
  status: StudentStatus;
  gender: "" | StudentGender;
  dateOfBirth: string;
};

export type StudentFormErrors = Partial<
  Record<"studentCode" | "firstName" | "lastName" | "gender" | "dateOfBirth", string>
>;

export type ValidateStudentFormOptions = {
  mode: "create" | "update";
  existing?: {
    gender: StudentGender | null;
    dateOfBirth: string | null;
  };
};

export function validateStudentForm(
  input: StudentFormInput,
  options: ValidateStudentFormOptions,
): { ok: true } | { ok: false; errors: StudentFormErrors } {
  const errors: StudentFormErrors = {};

  if (!input.studentCode.trim()) {
    errors.studentCode = "กรุณากรอกรหัสนักเรียน";
  }
  if (!input.firstName.trim()) {
    errors.firstName = "กรุณากรอกชื่อ";
  }
  if (!input.lastName.trim()) {
    errors.lastName = "กรุณากรอกนามสกุล";
  }

  const hadGender = Boolean(options.existing?.gender);
  const hadBirthDate = Boolean(options.existing?.dateOfBirth);
  const requireGender = options.mode === "create" || hadGender;
  const requireBirthDate = options.mode === "create" || hadBirthDate;

  if (requireGender && !input.gender) {
    errors.gender = "กรุณาเลือกเพศ";
  }

  const birthDate = input.dateOfBirth.trim();
  if (requireBirthDate && !birthDate) {
    errors.dateOfBirth = "กรุณาเลือกวันเกิด";
  } else if (birthDate && isFutureIsoDate(birthDate)) {
    errors.dateOfBirth = "วันเกิดต้องไม่เป็นวันในอนาคต";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

export function firstStudentFormError(errors: StudentFormErrors): string {
  return (
    errors.studentCode ??
    errors.firstName ??
    errors.lastName ??
    errors.gender ??
    errors.dateOfBirth ??
    "ข้อมูลไม่ถูกต้อง"
  );
}
