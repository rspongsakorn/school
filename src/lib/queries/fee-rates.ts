import { createClient } from "@/lib/supabase/client";
import { feeRateKey } from "@/lib/finance/fee-rate-keys";
import type { FeeItemRow } from "@/lib/data/fee-items";
import type { FeeRateMatrix } from "@/lib/data/fee-rates";

export async function fetchFeeItems(): Promise<FeeItemRow[]> {
  const supabase = createClient();

  // Primary query: with sort_order
  const { data, error } = await supabase
    .from("fee_items")
    .select("id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!error && data) {
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isTuition: row.is_tuition,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      hasReimbursableVariant: row.has_reimbursable_variant,
    }));
  }

  // Fallback: sort_order column not yet added — order by name only
  const { data: fbData, error: fbError } = await supabase
    .from("fee_items")
    .select("id, name, description, is_tuition, is_active")
    .order("name", { ascending: true });

  if (fbError || !fbData) return [];

  return fbData.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
    sortOrder: 0,
    hasReimbursableVariant: false,
  }));
}

export async function fetchFeeRateMatrix(semesterId: string): Promise<FeeRateMatrix> {
  const supabase = createClient();

  const [{ data: gradeData }, { data: itemData }, { data: rateData }] = await Promise.all([
    supabase
      .from("grade_levels")
      .select("id, name, sort_order")
      .eq("semester_id", semesterId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("fee_items")
      .select(
        "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant",
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("fee_rates")
      .select("id, grade_level_id, fee_item_id, amount, amount_reimbursable")
      .eq("semester_id", semesterId),
  ]);

  const rates: Record<string, { id: string; amount: number; amountReimbursable: number | null }> = {};
  for (const row of rateData ?? []) {
    rates[feeRateKey(row.grade_level_id, row.fee_item_id)] = {
      id: row.id,
      amount: Number(row.amount),
      amountReimbursable:
        row.amount_reimbursable != null ? Number(row.amount_reimbursable) : null,
    };
  }

  const allItems = (itemData ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
    sortOrder: row.sort_order ?? 0,
    hasReimbursableVariant: row.has_reimbursable_variant,
  }));

  // Match server-side: only active items in the matrix
  const activeItems = allItems
    .filter((i) => i.isActive)
    .map((i) => ({
      id: i.id,
      name: i.name,
      hasReimbursableVariant: i.hasReimbursableVariant,
    }));

  return {
    grades: (gradeData ?? []).map((g) => ({ id: g.id, name: g.name })),
    items: activeItems,
    rates,
  };
}
