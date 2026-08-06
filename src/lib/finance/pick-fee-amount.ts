import type { PriceTier } from "@/lib/finance/price-tier";

/** Which price was actually charged — snapshotted on `invoice_lines.variant`. */
export type FeeAmountVariant = PriceTier;

export type PickFeeAmountInput = {
  tier: PriceTier;
  hasReimbursableVariant: boolean;
  amount: number;
  amountReimbursable: number | null;
  amountPrivate: number | null;
};

export type PickFeeAmountResult = {
  amount: number;
  variant: FeeAmountVariant;
};

/**
 * Picks the amount for a fee item. A tier price that is not filled in falls back
 * to the standard price — never to another tier — so the result matches what the
 * operator sees in the rate matrix. The returned variant records the price that
 * was charged, so a fallback is recorded as `standard`.
 */
export function pickFeeAmount(input: PickFeeAmountInput): PickFeeAmountResult {
  if (input.hasReimbursableVariant) {
    if (input.tier === "reimbursable" && input.amountReimbursable != null) {
      return { amount: input.amountReimbursable, variant: "reimbursable" };
    }
    if (input.tier === "private" && input.amountPrivate != null) {
      return { amount: input.amountPrivate, variant: "private" };
    }
  }
  return { amount: input.amount, variant: "standard" };
}
