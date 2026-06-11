export type FeeItemLockableFields = {
  name: string;
  description: string | null;
  isTuition: boolean;
  hasReimbursableVariant: boolean;
};

/**
 * True when any field that is frozen after invoicing differs between the
 * current row and the proposed update. `is_active` is intentionally excluded —
 * it stays editable because it only affects future invoice generation.
 */
export function feeItemLockedFieldsChanged(
  current: FeeItemLockableFields,
  next: FeeItemLockableFields,
): boolean {
  return (
    current.name !== next.name ||
    (current.description ?? "") !== (next.description ?? "") ||
    current.isTuition !== next.isTuition ||
    current.hasReimbursableVariant !== next.hasReimbursableVariant
  );
}
