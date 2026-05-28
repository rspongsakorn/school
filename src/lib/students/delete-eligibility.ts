export type StudentReferenceCounts = {
  enrollments: number | null;
  invoices: number | null;
  /**
   * Only active (non-voided) payments block delete. Voided payments,
   * enrollments, and invoices are cascade-cleaned when the student is deleted.
   */
  activePayments: number | null;
};

export function studentHasBlockingReferences(counts: StudentReferenceCounts): boolean {
  return (counts.activePayments ?? 0) > 0;
}

export function canDeleteStudent(hasBlockingReferences: boolean): boolean {
  return !hasBlockingReferences;
}

export function studentDeleteBlockedReason(hasBlockingReferences: boolean): string | null {
  if (canDeleteStudent(hasBlockingReferences)) return null;
  return "มีใบเสร็จที่ยังไม่ยกเลิก — ต้องยกเลิกใบเสร็จก่อน";
}
