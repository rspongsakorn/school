"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { getSemesterById } from "@/lib/data/semesters";
import { createClient } from "@/lib/supabase/server";

export type FeeRateUpsertEntry = {
  gradeLevelId: string;
  feeItemId: string;
  amount: number;
  amountReimbursable: number | null;
};

function revalidateFeePaths() {
  revalidatePath("/fee-rates");
  revalidatePath("/invoices");
}

export async function upsertFeeRates(
  semesterId: string,
  entries: FeeRateUpsertEntry[],
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const semester = await getSemesterById(semesterId);
  if (!semester) return { ok: false, error: "ไม่พบภาคเรียน" };

  const supabase = await createClient();

  const { data: defaultReceiptType } = await supabase
    .from("receipt_types")
    .select("id")
    .eq("code", "01")
    .eq("is_active", true)
    .maybeSingle();

  const receiptTypeId = defaultReceiptType?.id ?? null;

  for (const entry of entries) {
    if (entry.amount < 0) {
      return { ok: false, error: "จำนวนเงินต้องไม่ติดลบ" };
    }
    if (entry.amountReimbursable != null && entry.amountReimbursable < 0) {
      return { ok: false, error: "ราคาเบิกได้ต้องไม่ติดลบ" };
    }

    const { error } = await supabase.from("fee_rates").upsert(
      {
        academic_year_id: semester.academic_year_id,
        semester_id: semesterId,
        grade_level_id: entry.gradeLevelId,
        fee_item_id: entry.feeItemId,
        amount: entry.amount,
        amount_reimbursable: entry.amountReimbursable,
        receipt_type_id: receiptTypeId,
      },
      { onConflict: "academic_year_id,semester_id,grade_level_id,fee_item_id" },
    );

    if (error) return { ok: false, error: "ไม่สามารถบันทึกอัตราค่าธรรมเนียมได้" };
  }

  revalidateFeePaths();
  return { ok: true };
}
