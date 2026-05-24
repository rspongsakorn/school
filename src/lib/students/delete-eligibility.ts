export type StudentReferenceCounts = {
  enrollments: number | null;
  invoices: number | null;
  payments: number | null;
};

export function studentHasBlockingReferences(counts: StudentReferenceCounts): boolean {
  return (counts.enrollments ?? 0) + (counts.invoices ?? 0) + (counts.payments ?? 0) > 0;
}

export function canDeleteStudent(hasBlockingReferences: boolean): boolean {
  return !hasBlockingReferences;
}

export function studentDeleteBlockedReason(hasBlockingReferences: boolean): string | null {
  if (canDeleteStudent(hasBlockingReferences)) return null;
  return "มีประวัติการลงทะเบียนหรือการเงิน — เปลี่ยนสถานะแทน";
}
