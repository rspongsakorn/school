import type { PriceTier } from "@/lib/finance/price-tier";

/**
 * Seeds the invoice-generate dialog: every candidate starts on the tier recorded
 * on their student profile, which the operator can still override per batch.
 */
export function defaultPriceTiers(
  candidates: { studentId: string; defaultPriceTier: PriceTier }[],
): Map<string, PriceTier> {
  return new Map(candidates.map((c) => [c.studentId, c.defaultPriceTier]));
}
