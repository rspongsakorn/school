"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { feeItemDeleteBlockedReason } from "@/lib/finance/fee-item-delete-eligibility";
import { feeItemLockedFieldsChanged } from "@/lib/finance/fee-item-edit-eligibility";

function revalidateFeePaths() {
  revalidatePath("/invoice-types");
  revalidatePath("/invoices");
}

export async function createFeeItem(input: {
  name: string;
  description?: string;
  isTuition: boolean;
  hasReimbursableVariant: boolean;
  invoiceTypeId: string;
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "กรุณาระบุชื่อรายการ" };
  if (!input.invoiceTypeId) return { ok: false, error: "ไม่พบประเภทใบแจ้ง" };

  const supabase = await createClient();
  const { error } = await supabase.from("fee_items").insert({
    name,
    description: input.description?.trim() || null,
    is_tuition: input.isTuition,
    is_active: true,
    has_reimbursable_variant: input.hasReimbursableVariant,
    invoice_type_id: input.invoiceTypeId,
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
    hasReimbursableVariant: boolean;
  },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "กรุณาระบุชื่อรายการ" };

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("fee_items")
    .select("name, description, is_tuition, has_reimbursable_variant")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { ok: false, error: "ไม่พบรายการค่าใช้จ่าย" };

  const nextDescription = input.description?.trim() || null;

  const { count } = await supabase
    .from("invoice_lines")
    .select("id", { count: "exact", head: true })
    .eq("fee_item_id", id);

  const referenced = (count ?? 0) > 0;
  if (
    referenced &&
    feeItemLockedFieldsChanged(
      {
        name: current.name,
        description: current.description,
        isTuition: current.is_tuition,
        hasReimbursableVariant: current.has_reimbursable_variant,
      },
      {
        name,
        description: nextDescription,
        isTuition: input.isTuition,
        hasReimbursableVariant: input.hasReimbursableVariant,
      },
    )
  ) {
    return {
      ok: false,
      error: "ออกใบแจ้งชำระแล้ว ไม่สามารถแก้ไขรายการนี้ได้ (แก้ได้เฉพาะสถานะใช้งาน)",
    };
  }

  const { error } = await supabase
    .from("fee_items")
    .update({
      name,
      description: nextDescription,
      is_tuition: input.isTuition,
      is_active: input.isActive,
      has_reimbursable_variant: input.hasReimbursableVariant,
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
  error?: string;
};

export async function deleteFeeItems(ids: string[]): Promise<DeleteFeeItemsResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return { ok: false, deletedCount: 0, blocked: [] };

  if (ids.length === 0) return { ok: true, deletedCount: 0, blocked: [] };

  const supabase = await createClient();

  // Pre-check: block เฉพาะ invoice_lines (ออกใบแจ้งชำระแล้ว)
  // fee_rates เป็นแค่ configuration — cascade delete ได้
  const [{ data: rateRefs }, { data: invoiceRefs }] = await Promise.all([
    supabase.from("fee_rates").select("fee_item_id").in("fee_item_id", ids),
    supabase.from("invoice_lines").select("fee_item_id").in("fee_item_id", ids),
  ]);

  const inRates = new Set((rateRefs ?? []).map((r) => r.fee_item_id));
  const inInvoices = new Set((invoiceRefs ?? []).map((r) => r.fee_item_id));

  // blocked = มีใบแจ้งชำระอ้างถึงเท่านั้น
  const blockedIds = ids.filter((id) => inInvoices.has(id));
  const canDelete = ids.filter((id) => !inInvoices.has(id));

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
        feeRates: 0,
        invoiceLines: 1,
      })!,
    }));
  }

  if (canDelete.length > 0) {
    // ลบ fee_rates ที่อ้างอิงรายการนี้ก่อน (ON DELETE RESTRICT)
    const withRates = canDelete.filter((id) => inRates.has(id));
    if (withRates.length > 0) {
      const { error: ratesError } = await supabase
        .from("fee_rates")
        .delete()
        .in("fee_item_id", withRates);
      if (ratesError) return { ok: false, deletedCount: 0, blocked, error: "ไม่สามารถลบอัตราค่าธรรมเนียมได้" };
    }

    const { error } = await supabase.from("fee_items").delete().in("id", canDelete);
    if (error) return { ok: false, deletedCount: 0, blocked, error: "ไม่สามารถลบรายการค่าใช้จ่ายได้" };
    revalidateFeePaths();
  }

  return { ok: true, deletedCount: canDelete.length, blocked };
}

export async function reorderFeeItems(
  orderedIds: string[],
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("fee_items")
      .update({ sort_order: i })
      .eq("id", orderedIds[i]);

    if (error) return { ok: false, error: "ไม่สามารถบันทึกลำดับได้" };
  }

  revalidateFeePaths();
  return { ok: true };
}
