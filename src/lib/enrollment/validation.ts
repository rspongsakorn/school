import type { EnrollmentStatus } from "@/lib/enrollment/constants";

const ENROLLMENT_STATUSES: EnrollmentStatus[] = ["enrolled", "transferred", "withdrawn"];

export function validateGradeLevelName(
  name: string,
): { ok: true } | { ok: false; error: string } {
  if (!name.trim()) return { ok: false, error: "กรุณากรอกชื่อชั้นเรียน" };
  return { ok: true };
}

export function validateClassroomNumber(
  value: string,
): { ok: true } | { ok: false; error: string } {
  if (!value.trim()) return { ok: false, error: "กรุณากรอกหมายเลขห้อง" };
  if (!/^\d+$/.test(value.trim())) return { ok: false, error: "หมายเลขห้องต้องเป็นตัวเลขเท่านั้น" };
  const num = Number(value.trim());
  if (num < 1 || num > 999) return { ok: false, error: "หมายเลขห้องต้องอยู่ระหว่าง 1–999" };
  return { ok: true };
}

export function isValidEnrollmentStatus(value: string): value is EnrollmentStatus {
  return ENROLLMENT_STATUSES.includes(value as EnrollmentStatus);
}
