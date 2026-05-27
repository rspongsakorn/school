import { createClient } from "@/lib/supabase/server";

export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
  sortOrder: number;
};

export async function listFeeItems(): Promise<FeeItemRow[]> {
  const supabase = await createClient();

  // Primary query: with sort_order (requires migration 20260527000000_fee_items_sort_order)
  const { data, error } = await supabase
    .from("fee_items")
    .select("id, name, description, is_tuition, is_active, sort_order")
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
  }));
}
