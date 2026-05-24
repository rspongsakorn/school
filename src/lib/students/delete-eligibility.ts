export type StudentReferenceCounts = {
  enrollments: number | null;
  invoices: number | null;
  payments: number | null;
};

export function studentHasBlockingReferences(counts: StudentReferenceCounts): boolean {
  return (counts.enrollments ?? 0) + (counts.invoices ?? 0) + (counts.payments ?? 0) > 0;
}
