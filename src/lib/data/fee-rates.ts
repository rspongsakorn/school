import { feeRateKey } from "@/lib/finance/fee-rate-keys";
import { listFeeItems } from "@/lib/data/fee-items";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { createClient } from "@/lib/supabase/server";

export type FeeRateMatrix = {
  grades: { id: string; name: string }[];
  items: { id: string; name: string }[];
  rates: Record<string, { id: string; amount: number }>;
};

export async function getFeeRateMatrix(semesterId: string): Promise<FeeRateMatrix> {
  const [grades, allItems, supabase] = await Promise.all([
    listGradeLevels(semesterId),
    listFeeItems(),
    createClient(),
  ]);

  const items = allItems.filter((i) => i.isActive).map((i) => ({ id: i.id, name: i.name }));

  const { data: rateRows } = await supabase
    .from("fee_rates")
    .select("id, grade_level_id, fee_item_id, amount")
    .eq("semester_id", semesterId);

  const rates: Record<string, { id: string; amount: number }> = {};
  for (const row of rateRows ?? []) {
    rates[feeRateKey(row.grade_level_id, row.fee_item_id)] = {
      id: row.id,
      amount: Number(row.amount),
    };
  }

  return {
    grades: grades.map((g) => ({ id: g.id, name: g.name })),
    items,
    rates,
  };
}

