"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { computeInvoiceTotal } from "@/lib/finance/amounts";
import { pickFeeAmount } from "@/lib/finance/pick-fee-amount";
import { canDeleteInvoice } from "@/lib/finance/invoice-delete-eligibility";
import { getInvoiceDeleteContext, listStudentIdsWithInvoice } from "@/lib/data/invoices";
import { createClient } from "@/lib/supabase/server";

export type GenerateInvoicesResult =
  | { ok: true; created: number; skipped: number }
  | { ok: false; error: string };

type GenerateInput = {
  semesterId: string;
  academicYearId: string;
  invoiceTypeId: string;
  feeItemIds: string[];
  studentIds?: string[];
  reimbursableStudentIds?: string[];
};

type EnrollmentForInvoice = {
  studentId: string;
  gradeLevelId: string;
};

async function loadEnrollmentsForInvoice(
  semesterId: string,
  studentIds?: string[],
): Promise<EnrollmentForInvoice[]> {
  const supabase = await createClient();
  let query = supabase
    .from("student_enrollments")
    .select("student_id, classroom_id")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

  if (studentIds && studentIds.length > 0) {
    query = query.in("student_id", studentIds);
  }

  const { data: enrollments } = await query;
  if (!enrollments || enrollments.length === 0) return [];

  const classroomIds = [...new Set(enrollments.map((e) => e.classroom_id))];
  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, grade_level_id")
    .in("id", classroomIds);

  const gradeByClassroom = new Map(
    (classrooms ?? []).map((c) => [c.id, c.grade_level_id]),
  );

  return enrollments
    .map((row) => {
      const gradeLevelId = gradeByClassroom.get(row.classroom_id);
      if (!gradeLevelId) return null;
      return { studentId: row.student_id, gradeLevelId };
    })
    .filter((row): row is EnrollmentForInvoice => row != null);
}

export async function generateInvoices(input: GenerateInput): Promise<GenerateInvoicesResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  if (input.feeItemIds.length === 0) {
    return { ok: false, error: "กรุณาเลือกรายการค่าใช้จ่ายอย่างน้อย 1 รายการ" };
  }

  if (!input.invoiceTypeId) {
    return { ok: false, error: "กรุณาเลือกประเภทใบแจ้ง" };
  }

  const supabase = await createClient();

  // Enforce the invariant that every selected fee item belongs to the chosen
  // receipt type (the client filters by type, but never trust the client).
  const { data: itemTypeRows } = await supabase
    .from("fee_items")
    .select("id, invoice_type_id")
    .in("id", input.feeItemIds);

  const itemsMatchType =
    itemTypeRows != null &&
    itemTypeRows.length === input.feeItemIds.length &&
    itemTypeRows.every((r) => r.invoice_type_id === input.invoiceTypeId);

  if (!itemsMatchType) {
    return { ok: false, error: "รายการค่าใช้จ่ายไม่ตรงกับประเภทใบแจ้ง" };
  }

  const [enrollments, existingSet] = await Promise.all([
    loadEnrollmentsForInvoice(input.semesterId, input.studentIds),
    listStudentIdsWithInvoice(input.semesterId),
  ]);

  if (enrollments.length === 0) {
    return { ok: false, error: "ไม่มีนักเรียนที่ลงทะเบียนในภาคนี้" };
  }

  const { data: rateRows } = await supabase
    .from("fee_rates")
    .select(
      "grade_level_id, fee_item_id, amount, amount_reimbursable, fee_items(name, has_reimbursable_variant)",
    )
    .eq("semester_id", input.semesterId)
    .in("fee_item_id", input.feeItemIds);

  type RateRow = {
    grade_level_id: string;
    fee_item_id: string;
    amount: number;
    amount_reimbursable: number | null;
    fee_items: { name: string; has_reimbursable_variant: boolean } | null;
  };

  const rates = (rateRows ?? []) as unknown as RateRow[];

  type RateMapEntry = {
    amount: number;
    amountReimbursable: number | null;
    name: string;
    hasReimbursableVariant: boolean;
  };

  const rateMap = new Map<string, RateMapEntry>();
  for (const rate of rates) {
    rateMap.set(`${rate.grade_level_id}:${rate.fee_item_id}`, {
      amount: Number(rate.amount),
      amountReimbursable:
        rate.amount_reimbursable != null ? Number(rate.amount_reimbursable) : null,
      name: rate.fee_items?.name ?? "",
      hasReimbursableVariant: rate.fee_items?.has_reimbursable_variant ?? false,
    });
  }

  const reimbursableSet = new Set(input.reimbursableStudentIds ?? []);

  let created = 0;
  let skipped = 0;

  // Phase 1: build all rows in memory (no DB calls)
  type InvoiceRow = {
    id: string;
    student_id: string;
    academic_year_id: string;
    semester_id: string;
    invoice_type_id: string;
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    status: string;
    is_reimbursable: boolean;
  };
  type LineRow = {
    invoice_id: string;
    fee_item_id: string;
    description: string;
    amount: number;
    variant: "standard" | "reimbursable";
  };

  const invoiceRows: InvoiceRow[] = [];
  const lineRows: LineRow[] = [];

  for (const enrollment of enrollments) {
    if (existingSet.has(enrollment.studentId)) {
      skipped += 1;
      continue;
    }

    const isReimbursable = reimbursableSet.has(enrollment.studentId);
    const lines: LineRow[] = [];

    for (const feeItemId of input.feeItemIds) {
      const rate = rateMap.get(`${enrollment.gradeLevelId}:${feeItemId}`);
      if (!rate) continue;
      const picked = pickFeeAmount({
        isReimbursable,
        hasReimbursableVariant: rate.hasReimbursableVariant,
        amount: rate.amount,
        amountReimbursable: rate.amountReimbursable,
      });
      lines.push({
        invoice_id: "", // filled below
        fee_item_id: feeItemId,
        description: rate.name,
        amount: picked.amount,
        variant: picked.variant,
      });
    }

    if (lines.length === 0) {
      skipped += 1;
      continue;
    }

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const totalAmount = computeInvoiceTotal(subtotal, null, null);
    const invoiceId = crypto.randomUUID();

    invoiceRows.push({
      id: invoiceId,
      student_id: enrollment.studentId,
      academic_year_id: input.academicYearId,
      semester_id: input.semesterId,
      invoice_type_id: input.invoiceTypeId,
      subtotal,
      total_amount: totalAmount,
      paid_amount: 0,
      status: "unpaid",
      is_reimbursable: isReimbursable,
    });

    for (const line of lines) {
      lineRows.push({ ...line, invoice_id: invoiceId });
    }

    created += 1;
  }

  // Phase 2 & 3: two batch inserts
  if (invoiceRows.length > 0) {
    const { error: invoiceError } = await supabase
      .from("student_invoices")
      .insert(invoiceRows);

    if (invoiceError) {
      return { ok: false, error: "ไม่สามารถสร้างใบแจ้งชำระได้" };
    }

    const { error: linesError } = await supabase
      .from("invoice_lines")
      .insert(lineRows);

    if (linesError) {
      return { ok: false, error: "ไม่สามารถสร้างรายการในใบแจ้งชำระได้" };
    }
  }

  revalidateFinancePaths();
  return { ok: true, created, skipped };
}

export async function updateInvoiceDiscount(
  invoiceId: string,
  input: {
    discountType: "percent" | "fixed" | null;
    discountValue: number | null;
  },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("student_invoices")
    .select("subtotal, paid_amount")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "ไม่พบใบแจ้งชำระ" };
  if (Number(invoice.paid_amount) > 0) {
    return { ok: false, error: "ไม่สามารถแก้ส่วนลดหลังมีการชำระแล้ว" };
  }

  const subtotal = Number(invoice.subtotal);
  const totalAmount = computeInvoiceTotal(
    subtotal,
    input.discountType,
    input.discountValue,
  );

  const { error } = await supabase
    .from("student_invoices")
    .update({
      discount_type: input.discountType,
      discount_value: input.discountValue,
      total_amount: totalAmount,
      status: "unpaid",
    })
    .eq("id", invoiceId);

  if (error) return { ok: false, error: "ไม่สามารถบันทึกส่วนลดได้" };

  revalidateFinancePaths();
  return { ok: true };
}

export type DeleteInvoicesResult =
  | { ok: true; deleted: number; skipped: number }
  | { ok: false; error: string };

export async function deleteInvoices(invoiceIds: string[]): Promise<DeleteInvoicesResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const uniqueIds = [...new Set(invoiceIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "กรุณาเลือกใบแจ้งชำระที่ต้องการลบ" };
  }

  const supabase = await createClient();
  const deleteContext = await getInvoiceDeleteContext(uniqueIds);

  if (deleteContext.size === 0) {
    return { ok: false, error: "ไม่พบใบแจ้งชำระที่เลือก" };
  }

  const deletableIds = uniqueIds.filter((id) => {
    const ctx = deleteContext.get(id);
    return ctx ? canDeleteInvoice(ctx) : false;
  });

  const skipped = uniqueIds.length - deletableIds.length;

  if (deletableIds.length === 0) {
    return {
      ok: false,
      error: "ไม่สามารถลบได้ — ต้องยกเลิกใบเสร็จที่เกี่ยวข้องทั้งหมดก่อน",
    };
  }

  for (const invoiceId of deletableIds) {
    const { data: voidedAllocations, error: allocFetchError } = await supabase
      .from("payment_allocations")
      .select("id, payments!inner ( status )")
      .eq("invoice_id", invoiceId)
      .eq("payments.status", "voided");

    if (allocFetchError) {
      return { ok: false, error: "ไม่สามารถเตรียมลบใบแจ้งชำระได้" };
    }

    type AllocRow = { id: string; payments: { status: string } };
    const allocationIds = ((voidedAllocations ?? []) as unknown as AllocRow[]).map((row) => row.id);

    if (allocationIds.length > 0) {
      const { error: allocDeleteError } = await supabase
        .from("payment_allocations")
        .delete()
        .in("id", allocationIds);

      if (allocDeleteError) {
        return { ok: false, error: "ไม่สามารถลบใบแจ้งชำระได้" };
      }
    }

    const { error: invoiceDeleteError } = await supabase
      .from("student_invoices")
      .delete()
      .eq("id", invoiceId);

    if (invoiceDeleteError) {
      return { ok: false, error: "ไม่สามารถลบใบแจ้งชำระได้" };
    }
  }

  revalidateFinancePaths();
  return { ok: true, deleted: deletableIds.length, skipped };
}

export async function updateInvoiceReimbursable(
  invoiceId: string,
  isReimbursable: boolean,
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("student_invoices")
    .select("id, semester_id, paid_amount, discount_type, discount_value, student_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "ไม่พบใบแจ้งชำระ" };
  if (Number(invoice.paid_amount) > 0) {
    return { ok: false, error: "ไม่สามารถเปลี่ยนประเภทราคาหลังมีการชำระแล้ว" };
  }

  // Lookup grade for the student in this semester
  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("classroom_id, classrooms!inner(grade_level_id)")
    .eq("student_id", invoice.student_id)
    .eq("semester_id", invoice.semester_id)
    .eq("status", "enrolled")
    .maybeSingle();

  type EnrollmentRow = {
    classroom_id: string;
    classrooms: { grade_level_id: string };
  };
  const gradeLevelId =
    (enrollment as unknown as EnrollmentRow | null)?.classrooms.grade_level_id;
  if (!gradeLevelId) {
    return { ok: false, error: "ไม่พบชั้นเรียนของนักเรียน" };
  }

  // Load existing lines (need fee_item_id to look up new amount)
  const { data: existingLines } = await supabase
    .from("invoice_lines")
    .select("id, fee_item_id, description")
    .eq("invoice_id", invoiceId);

  if (!existingLines || existingLines.length === 0) {
    return { ok: false, error: "ใบแจ้งชำระไม่มีรายการ" };
  }

  const feeItemIds = existingLines.map((l) => l.fee_item_id);

  const { data: rateRows } = await supabase
    .from("fee_rates")
    .select(
      "fee_item_id, amount, amount_reimbursable, fee_items(has_reimbursable_variant)",
    )
    .eq("semester_id", invoice.semester_id)
    .eq("grade_level_id", gradeLevelId)
    .in("fee_item_id", feeItemIds);

  type RateRow = {
    fee_item_id: string;
    amount: number;
    amount_reimbursable: number | null;
    fee_items: { has_reimbursable_variant: boolean } | null;
  };

  const rateMap = new Map<string, RateRow>();
  for (const row of (rateRows ?? []) as unknown as RateRow[]) {
    rateMap.set(row.fee_item_id, row);
  }

  let subtotal = 0;
  for (const line of existingLines) {
    const rate = rateMap.get(line.fee_item_id);
    if (!rate) {
      return { ok: false, error: "ไม่พบอัตราค่าธรรมเนียมของบางรายการ" };
    }
    const picked = pickFeeAmount({
      isReimbursable,
      hasReimbursableVariant: rate.fee_items?.has_reimbursable_variant ?? false,
      amount: Number(rate.amount),
      amountReimbursable:
        rate.amount_reimbursable != null ? Number(rate.amount_reimbursable) : null,
    });
    subtotal += picked.amount;

    const { error: lineError } = await supabase
      .from("invoice_lines")
      .update({ amount: picked.amount, variant: picked.variant })
      .eq("id", line.id);
    if (lineError) {
      return { ok: false, error: "ไม่สามารถปรับรายการในใบแจ้งชำระได้" };
    }
  }

  const totalAmount = computeInvoiceTotal(
    subtotal,
    invoice.discount_type as "percent" | "fixed" | null,
    invoice.discount_value != null ? Number(invoice.discount_value) : null,
  );

  const { error: invoiceError } = await supabase
    .from("student_invoices")
    .update({
      is_reimbursable: isReimbursable,
      subtotal,
      total_amount: totalAmount,
      status: "unpaid",
    })
    .eq("id", invoiceId);

  if (invoiceError) {
    return { ok: false, error: "ไม่สามารถบันทึกการเปลี่ยนแปลงได้" };
  }

  revalidateFinancePaths();
  return { ok: true };
}

function revalidateFinancePaths() {
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/reports/outstanding");
  revalidatePath("/reports/collections");
  revalidatePath("/");
}
