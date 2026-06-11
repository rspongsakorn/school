import { createClient } from "@/lib/supabase/server";

export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
  sortOrder: number;
  hasReimbursableVariant: boolean;
  invoiceTypeId: string;
};

export async function listFeeItems(invoiceTypeId?: string): Promise<FeeItemRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("fee_items")
    .select(
      "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant, invoice_type_id",
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (invoiceTypeId) {
    query = query.eq("invoice_type_id", invoiceTypeId);
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
    invoiceTypeId: row.invoice_type_id,
  }));
}
