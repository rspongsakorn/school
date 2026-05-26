"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { feeItemDeleteBlockedReason } from "@/lib/finance/fee-item-delete-eligibility";

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

export type DeleteFeeItemsResult = {
  ok: boolean;
  deletedCount: number;
  blocked: { id: string; name: string; reason: string }[];
};

export async function deleteFeeItems(ids: string[]): Promise<DeleteFeeItemsResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return { ok: false, deletedCount: 0, blocked: [] };

  if (ids.length === 0) return { ok: true, deletedCount: 0, blocked: [] };

  const supabase = await createClient();

  // Pre-check: ดูว่า id ไหนถูก้างอิงใน fee_rates หรือ invoice_lines
  const [{ data: rateRefs }, { data: invoiceRefs }] = await Promise.all([
    supabase.from("fee_rates").select("fee_item_id").in("fee_item_id", ids),
    supabase.from("invoice_lines").select("fee_item_id").in("fee_item_id", ids),
  ]);

  const inRates = new Set((rateRefs ?? []).map((r) => r.fee_item_id));
  const inInvoices = new Set((invoiceRefs ?? []).map((r) => r.fee_item_id));

  const blockedIds = ids.filter((id) => inRates.has(id) || inInvoices.has(id));
  const canDelete = ids.filter((id) => !inRates.has(id) && !inInvoices.has(id));

  let blocked: { id: string; name: string; reason: string }[] = [];
  if (blockedIds.length > 0) {
    const { data: blockedItems } = await supabase
      .from("fee_items")
      .select("id, name")
      .in("id", blockedIds);

    blocked = (blockedItems ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      reason: feeItemDeleteBlockedReason({
        feeRates: inRates.has(item.id) ? 1 : 0,
        invoiceLines: inInvoices.has(item.id) ? 1 : 0,
      })!,
    }));
  }

  if (canDelete.length > 0) {
    const { error } = await supabase.from("fee_items").delete().in("id", canDelete);
    if (error) return { ok: false, deletedCount: 0, blocked };
    revalidateFeePaths();
  }

  return { ok: true, deletedCount: canDelete.length, blocked };
}
