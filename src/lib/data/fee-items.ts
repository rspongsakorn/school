import { createClient } from "@/lib/supabase/server";

export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
  sortOrder: number;
  hasReimbursableVariant: boolean;
  receiptTypeId: string;
};

export async function listFeeItems(receiptTypeId?: string): Promise<FeeItemRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("fee_items")
    .select(
      "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant, receipt_type_id",
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (receiptTypeId) {
    query = query.eq("receipt_type_id", receiptTypeId);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    hasReimbursableVariant: row.has_reimbursable_variant,
    receiptTypeId: row.receipt_type_id,
  }));
}
