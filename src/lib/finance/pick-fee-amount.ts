export type FeeAmountVariant = "standard" | "reimbursable";

export type PickFeeAmountInput = {
  isReimbursable: boolean;
  hasReimbursableVariant: boolean;
  amount: number;
  amountReimbursable: number | null;
};

export type PickFeeAmountResult = {
  amount: number;
  variant: FeeAmountVariant;
};

export function pickFeeAmount(input: PickFeeAmountInput): PickFeeAmountResult {
  if (
    input.isReimbursable &&
    input.hasReimbursableVariant &&
    input.amountReimbursable != null
  ) {
    return { amount: input.amountReimbursable, variant: "reimbursable" };
  }
  return { amount: input.amount, variant: "standard" };
}
