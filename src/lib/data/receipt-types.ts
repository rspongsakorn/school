import { createClient } from "@/lib/supabase/server";

export type ReceiptTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export async function listReceiptTypes(): Promise<ReceiptTypeRow[]> {
  const supabase = await createClient();
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

export async function getDefaultReceiptTypeId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("receipt_types")
    .select("id")
    .eq("code", "01")
    .eq("is_active", true)
    .maybeSingle();

  return data?.id ?? null;
}
