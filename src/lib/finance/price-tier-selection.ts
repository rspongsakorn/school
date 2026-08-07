import type { PriceTier } from "@/lib/finance/price-tier";

/**
 * Resolves the tier each candidate will be invoiced on: the operator's override
 * for this batch when present, otherwise the tier recorded on the student.
 *
 * Overrides are kept separate from the candidate list on purpose — the list
 * loads asynchronously, so snapshotting it into state would silently fall back
 * to `standard` for everyone when the dialog is opened before the fetch lands.
 */
export function effectivePriceTiers(
  candidates: { studentId: string; defaultPriceTier: PriceTier }[],
  overrides: Map<string, PriceTier>,
): Map<string, PriceTier> {
  return new Map(
    candidates.map((c) => [c.studentId, overrides.get(c.studentId) ?? c.defaultPriceTier]),
  );
}
