import { feeRateKey } from "@/lib/finance/fee-rate-keys";
import { listFeeItems } from "@/lib/data/fee-items";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { createClient } from "@/lib/supabase/server";

export type FeeRateMatrixItem = {
  id: string;
  name: string;
  hasReimbursableVariant: boolean;
};

export type FeeRateMatrixCell = {
  id: string;
  amount: number;
  amountReimbursable: number | null;
};

export type FeeRateMatrix = {
  grades: { id: string; name: string }[];
  items: FeeRateMatrixItem[];
  rates: Record<string, FeeRateMatrixCell>;
};

export async function getFeeRateMatrix(
  semesterId: string,
  receiptTypeId: string,
): Promise<FeeRateMatrix> {
  const [grades, allItems, supabase] = await Promise.all([
    listGradeLevels(semesterId),
    listFeeItems(receiptTypeId),
    createClient(),
  ]);

  const items: FeeRateMatrixItem[] = allItems
    .filter((i) => i.isActive)
    .map((i) => ({
      id: i.id,
      name: i.name,
      hasReimbursableVariant: i.hasReimbursableVariant,
    }));

  const { data: rateRows } = await supabase
    .from("fee_rates")
    .select("id, grade_level_id, fee_item_id, amount, amount_reimbursable")
    .eq("semester_id", semesterId);

  const rates: Record<string, FeeRateMatrixCell> = {};
  for (const row of rateRows ?? []) {
    rates[feeRateKey(row.grade_level_id, row.fee_item_id)] = {
      id: row.id,
      amount: Number(row.amount),
      amountReimbursable:
        row.amount_reimbursable != null ? Number(row.amount_reimbursable) : null,
    };
  }

  return {
    grades: grades.map((g) => ({ id: g.id, name: g.name })),
    items,
    rates,
  };
}
