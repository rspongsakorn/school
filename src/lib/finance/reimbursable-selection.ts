export function defaultReimbursableIds(
  candidates: { studentId: string; defaultReimbursable: boolean }[],
): Set<string> {
  return new Set(
    candidates.filter((c) => c.defaultReimbursable).map((c) => c.studentId),
  );
}
