"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

function revalidateInvoiceTypePaths() {
  revalidatePath("/invoice-types");
  revalidatePath("/payments");
}

export async function createInvoiceType(input: {
  code: string;
  name: string;
  description?: string;
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) return { ok: false, error: "กรุณาระบุรหัสและชื่อ" };

  const supabase = await createClient();
  const { error } = await supabase.from("invoice_types").insert({
    code,
    name,
    description: input.description?.trim() || null,
    is_active: true,
  });

  if (error?.code === "23505") {
    return { ok: false, error: "รหัสประเภทใบแจ้งนี้มีอยู่แล้ว" };
  }
  if (error) return { ok: false, error: "ไม่สามารถเพิ่มประเภทใบแจ้งได้" };

  revalidateInvoiceTypePaths();
  return { ok: true };
}

export async function updateInvoiceType(
  id: string,
  input: {
    code: string;
    name: string;
    description?: string;
    isActive: boolean;
  },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) return { ok: false, error: "กรุณาระบุรหัสและชื่อ" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice_types")
    .update({
      code,
      name,
      description: input.description?.trim() || null,
      is_active: input.isActive,
    })
    .eq("id", id);

  if (error?.code === "23505") {
    return { ok: false, error: "รหัสประเภทใบแจ้งนี้มีอยู่แล้ว" };
  }
  if (error) return { ok: false, error: "ไม่สามารถบันทึกประเภทใบแจ้งได้" };

  revalidateInvoiceTypePaths();
  return { ok: true };
}
