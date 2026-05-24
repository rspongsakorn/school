"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { computeInvoiceTotal } from "@/lib/finance/amounts";
import { canDeleteInvoice } from "@/lib/finance/invoice-delete-eligibility";
import { getInvoiceDeleteContext, listStudentIdsWithInvoice } from "@/lib/data/invoices";
import { createClient } from "@/lib/supabase/server";

export type GenerateInvoicesResult =
  | { ok: true; created: number; skipped: number }
  | { ok: false; error: string };

type GenerateInput = {
  semesterId: string;
  academicYearId: string;
  academicYearName: string;
  semesterNumber: number;
  feeItemIds: string[];
  studentIds?: string[];
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

  const supabase = await createClient();
  const [enrollments, existingSet] = await Promise.all([
    loadEnrollmentsForInvoice(input.semesterId, input.studentIds),
    listStudentIdsWithInvoice(input.semesterId),
  ]);

  if (enrollments.length === 0) {
    return { ok: false, error: "ไม่มีนักเรียนที่ลงทะเบียนในภาคนี้" };
  }

  const { data: rateRows } = await supabase
    .from("fee_rates")
    .select("grade_level_id, fee_item_id, amount, fee_items(name)")
    .eq("semester_id", input.semesterId)
    .in("fee_item_id", input.feeItemIds);

  type RateRow = {
    grade_level_id: string;
    fee_item_id: string;
    amount: number;
    fee_items: { name: string } | null;
  };

  const rates = (rateRows ?? []) as unknown as RateRow[];
  const rateMap = new Map<string, { amount: number; name: string }>();
  for (const rate of rates) {
    rateMap.set(`${rate.grade_level_id}:${rate.fee_item_id}`, {
      amount: Number(rate.amount),
      name: rate.fee_items?.name ?? "",
    });
  }

  const invoiceName = `ภาคเรียนที่ ${input.semesterNumber}/${input.academicYearName}`;
  let created = 0;
  let skipped = 0;

  for (const enrollment of enrollments) {
    if (existingSet.has(enrollment.studentId)) {
      skipped += 1;
      continue;
    }

    const lines: { fee_item_id: string; description: string; amount: number }[] = [];
    for (const feeItemId of input.feeItemIds) {
      const rate = rateMap.get(`${enrollment.gradeLevelId}:${feeItemId}`);
      if (!rate) continue;
      lines.push({
        fee_item_id: feeItemId,
        description: rate.name,
        amount: rate.amount,
      });
    }

    if (lines.length === 0) {
      skipped += 1;
      continue;
    }

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const totalAmount = computeInvoiceTotal(subtotal, null, null);

    const { data: invoice, error: invoiceError } = await supabase
      .from("student_invoices")
      .insert({
        student_id: enrollment.studentId,
        academic_year_id: input.academicYearId,
        semester_id: input.semesterId,
        invoice_name: invoiceName,
        subtotal,
        total_amount: totalAmount,
        paid_amount: 0,
        status: "unpaid",
      })
      .select("id")
      .single();

    if (invoiceError || !invoice) {
      return { ok: false, error: "ไม่สามารถสร้างใบแจ้งชำระได้" };
    }

    const { error: linesError } = await supabase.from("invoice_lines").insert(
      lines.map((line) => ({
        invoice_id: invoice.id,
        fee_item_id: line.fee_item_id,
        description: line.description,
        amount: line.amount,
      })),
    );

    if (linesError) {
      return { ok: false, error: "ไม่สามารถสร้างรายการในใบแจ้งชำระได้" };
    }

    existingSet.add(enrollment.studentId);
    created += 1;
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

function revalidateFinancePaths() {
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/reports/outstanding");
  revalidatePath("/reports/collections");
  revalidatePath("/");
}
