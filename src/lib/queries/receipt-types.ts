import { createClient } from "@/lib/supabase/client";
import type { ReceiptTypeRow } from "@/lib/data/receipt-types";

export async function fetchReceiptTypes(): Promise<ReceiptTypeRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("receipt_types")
    .select("id, code, name, description, is_active")
    .order("code", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
  }));
}
