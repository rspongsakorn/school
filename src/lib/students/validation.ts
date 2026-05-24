import type { StudentStatus } from "@/lib/students/constants";

export type StudentFormInput = {
  studentCode: string;
  firstName: string;
  lastName: string;
  idCard: string;
  status: StudentStatus;
};

export type StudentFormErrors = Partial<
  Record<"studentCode" | "firstName" | "lastName", string>
>;

export function validateStudentForm(
  input: StudentFormInput,
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

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

export function firstStudentFormError(errors: StudentFormErrors): string {
  return errors.studentCode ?? errors.firstName ?? errors.lastName ?? "ข้อมูลไม่ถูกต้อง";
}
