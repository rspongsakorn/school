import type { EnrollmentStatus } from "@/lib/enrollment/constants";

export type EnrollmentDeleteContext = {
  status: EnrollmentStatus;
  hasInvoiceInSemester: boolean;
};

export function canDeleteEnrollment(ctx: EnrollmentDeleteContext): boolean {
  if (ctx.status !== "enrolled") return false;
  return !ctx.hasInvoiceInSemester;
}

export function enrollmentDeleteBlockedReason(ctx: EnrollmentDeleteContext): string | null {
  if (canDeleteEnrollment(ctx)) return null;
  if (ctx.hasInvoiceInSemester) {
    return "มีใบแจ้งชำระแล้ว — ใช้เปลี่ยนสถานะแทน";
  }
  return "ไม่สามารถลบการลงทะเบียนนี้ได้";
}
