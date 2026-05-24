import { createClient } from "@/lib/supabase/server";

export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
};

export async function listFeeItems(): Promise<FeeItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_items")
    .select("id, name, description, is_tuition, is_active")
    .order("name", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
  }));
}
