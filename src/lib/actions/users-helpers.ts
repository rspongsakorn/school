/**
 * Pure helper — returns true if `excludeId` is the only active admin in the list.
 * Exported for unit testing. Lives outside "use server" so it can be a sync function.
 */
export function isLastAdmin(
  profiles: { id: string; role: string; is_active: boolean }[],
  excludeId: string,
): boolean {
  return (
    profiles.filter((p) => p.role === "admin" && p.is_active && p.id !== excludeId).length === 0
  );
}
