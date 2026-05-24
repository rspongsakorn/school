"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

function revalidateFeePaths() {
  revalidatePath("/fee-rates");
  revalidatePath("/invoices");
}

export async function createFeeItem(input: {
  name: string;
  description?: string;
  isTuition: boolean;
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "กรุณาระบุชื่อรายการ" };

  const supabase = await createClient();
  const { error } = await supabase.from("fee_items").insert({
    name,
    description: input.description?.trim() || null,
    is_tuition: input.isTuition,
    is_active: true,
  });

  if (error) return { ok: false, error: "ไม่สามารถเพิ่มรายการค่าใช้จ่ายได้" };

  revalidateFeePaths();
  return { ok: true };
}

export async function updateFeeItem(
  id: string,
  input: {
    name: string;
    description?: string;
    isTuition: boolean;
    isActive: boolean;
  },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "กรุณาระบุชื่อรายการ" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fee_items")
    .update({
      name,
      description: input.description?.trim() || null,
      is_tuition: input.isTuition,
      is_active: input.isActive,
    })
    .eq("id", id);

  if (error) return { ok: false, error: "ไม่สามารถบันทึกรายการค่าใช้จ่ายได้" };

  revalidateFeePaths();
  return { ok: true };
}
