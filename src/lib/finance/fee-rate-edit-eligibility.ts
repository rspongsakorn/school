/**
 * Split rate upsert entries into those whose grade is unlocked (`allowed`) and
 * those whose grade already has an issued invoice and is therefore frozen
 * (`locked`). Generic over the entry shape; only `gradeLevelId` is required.
 */
export function partitionRateEntriesByLock<T extends { gradeLevelId: string }>(
  entries: T[],
  lockedGradeIds: Set<string>,
): { allowed: T[]; locked: T[] } {
  const allowed: T[] = [];
  const locked: T[] = [];
  for (const entry of entries) {
    if (lockedGradeIds.has(entry.gradeLevelId)) locked.push(entry);
    else allowed.push(entry);
  }
  return { allowed, locked };
}
