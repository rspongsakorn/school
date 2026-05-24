export type StudentReferenceCounts = {
  enrollments: number | null;
  invoices: number | null;
  /** Only active (non-voided) payments block delete; voided history is removed on delete. */
  activePayments: number | null;
};

export function studentHasBlockingReferences(counts: StudentReferenceCounts): boolean {
  return (counts.enrollments ?? 0) + (counts.invoices ?? 0) + (counts.activePayments ?? 0) > 0;
}

export function canDeleteStudent(hasBlockingReferences: boolean): boolean {
  return !hasBlockingReferences;
}

export function studentDeleteBlockedReason(hasBlockingReferences: boolean): string | null {
  if (canDeleteStudent(hasBlockingReferences)) return null;
  return "มีประวัติการลงทะเบียนหรือการเงิน — เปลี่ยนสถานะแทน";
}
