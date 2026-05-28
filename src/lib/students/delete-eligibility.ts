export type StudentReferenceCounts = {
  /** Current enrollment (status='enrolled') — must be removed before delete. */
  activeEnrollments: number | null;
  /** Historical invoices — cascade-cleaned on delete, not a blocker. */
  invoices: number | null;
  /** Active (non-voided) payments — must be voided before delete. */
  activePayments: number | null;
};

export function studentHasBlockingReferences(counts: StudentReferenceCounts): boolean {
  return (counts.activeEnrollments ?? 0) > 0 || (counts.activePayments ?? 0) > 0;
}

export function canDeleteStudent(hasBlockingReferences: boolean): boolean {
  return !hasBlockingReferences;
}

export function studentDeleteBlockedReason(hasBlockingReferences: boolean): string | null {
  if (canDeleteStudent(hasBlockingReferences)) return null;
  return "นักเรียนยังลงทะเบียนในห้อง หรือมีใบเสร็จที่ยังไม่ยกเลิก";
}
