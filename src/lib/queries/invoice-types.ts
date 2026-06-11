import { createClient } from "@/lib/supabase/client";
import type { InvoiceTypeRow } from "@/lib/data/invoice-types";

export async function fetchInvoiceTypes(): Promise<InvoiceTypeRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoice_types")
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
