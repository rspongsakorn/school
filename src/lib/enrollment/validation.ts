import type { EnrollmentStatus } from "@/lib/enrollment/constants";

const ENROLLMENT_STATUSES: EnrollmentStatus[] = ["enrolled", "transferred", "withdrawn"];

export function validateGradeLevelName(
  name: string,
): { ok: true } | { ok: false; error: string } {
  if (!name.trim()) return { ok: false, error: "กรุณากรอกชื่อชั้นเรียน" };
  return { ok: true };
}

export function validateClassroomName(
  name: string,
): { ok: true } | { ok: false; error: string } {
  if (!name.trim()) return { ok: false, error: "กรุณากรอกชื่อห้องเรียน" };
  return { ok: true };
}

export function isValidEnrollmentStatus(value: string): value is EnrollmentStatus {
  return ENROLLMENT_STATUSES.includes(value as EnrollmentStatus);
}
