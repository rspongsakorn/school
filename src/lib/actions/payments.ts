"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireFinanceAction } from "@/lib/auth/require-finance";
import {
  allocatePaymentFifo,
  deriveInvoiceStatus,
} from "@/lib/finance/amounts";
import { formatReceiptNumber, parseMaxSequence } from "@/lib/finance/receipt-number";
import { getStudentOutstandingInvoices } from "@/lib/data/invoices";
import { getDefaultInvoiceTypeId } from "@/lib/data/invoice-types";
import { resolveSingleInvoicePayment } from "@/lib/finance/single-invoice-allocation";
import { createClient } from "@/lib/supabase/server";
import { formatStudentName } from "@/lib/format";
import { searchStudentsForPayment } from "@/lib/data/payments";
import { getStudentGradeMap } from "@/lib/data/enrollments";

export type RecordPaymentResult =
  | { ok: true; paymentId: string; receiptNumber: string; snapshot: Record<string, unknown> }
  | { ok: false; error: string };

type RecordPaymentInput = {
  invoiceId: string;
  studentId: string;
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  amount: number;
  paymentMethod: "cash" | "transfer";
  transferReference?: string;
  note?: string;
};

export async function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  if (input.amount <= 0) {
    return { ok: false, error: "จำนวนเงินต้องมากกว่า 0" };
  }

  const supabase = await createClient();

  type InvoiceRow = {
    id: string;
    total_amount: number;
    paid_amount: number;
    invoice_type_id: string | null;
    student_id: string;
    invoice_types: { name: string } | null;
  };

  const { data: invoice } = await supabase
    .from("student_invoices")
    .select("id, total_amount, paid_amount, invoice_type_id, student_id, invoice_types ( name )")
    .eq("id", input.invoiceId)
    .maybeSingle() as unknown as { data: InvoiceRow | null };

  if (!invoice) return { ok: false, error: "ไม่พบใบแจ้งชำระ" };
  if (invoice.student_id !== input.studentId) {
    return { ok: false, error: "ใบแจ้งชำระไม่ตรงกับนักเรียน" };
  }

  const outstanding = Math.max(
    0,
    Math.round((Number(invoice.total_amount) - Number(invoice.paid_amount)) * 100) / 100,
  );

  const resolved = resolveSingleInvoicePayment({ amount: input.amount, outstanding });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const invoiceTypeId = invoice.invoice_type_id;
  if (!invoiceTypeId) return { ok: false, error: "ใบแจ้งชำระไม่มีประเภทใบแจ้ง" };

  const allocations = [{ invoiceId: invoice.id, amount: resolved.amount }];

  const [{ data: existingReceipts }, { data: student }] = await Promise.all([
    supabase
      .from("payments")
      .select("receipt_number")
      .eq("academic_year_id", input.academicYearId),
    supabase
      .from("students")
      .select("student_code, first_name, last_name")
      .eq("id", input.studentId)
      .maybeSingle(),
  ]);

  if (!student) return { ok: false, error: "ไม่พบนักเรียน" };

  const nextSeq =
    parseMaxSequence(
      (existingReceipts ?? []).map((r) => r.receipt_number),
      input.academicYearName,
    ) + 1;
  const receiptNumber = formatReceiptNumber(input.academicYearName, nextSeq);

  const gradeByStudent = await getStudentGradeMap(input.semesterId);
  const gradeClassroom = gradeByStudent.get(input.studentId) ?? "—";

  const invoiceName = invoice.invoice_types?.name ?? "—";
  const allocationDetails = allocations.map((a) => ({
    invoiceId: a.invoiceId,
    invoiceName,
    amount: a.amount,
  }));

  const paidTotal = allocations.reduce((sum, a) => sum + a.amount, 0);

  const snapshot: Record<string, unknown> = {
    receiptNumber,
    paidAt: new Date().toISOString(),
    studentCode: student.student_code,
    studentName: formatStudentName(student.first_name, student.last_name),
    gradeClassroom,
    paymentMethod: input.paymentMethod,
    transferReference: input.transferReference?.trim() || null,
    amount: paidTotal,
    allocations: allocationDetails,
    recordedBy: auth.profile.display_name ?? "เจ้าหน้าที่",
  };

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      receipt_number: receiptNumber,
      student_id: input.studentId,
      academic_year_id: input.academicYearId,
      amount: paidTotal,
      payment_method: input.paymentMethod,
      transfer_reference: input.transferReference?.trim() || null,
      recorded_by: auth.profile.id,
      note: input.note?.trim() || null,
      status: "active",
    })
    .select("id")
    .single();

  if (paymentError || !payment) {
    return { ok: false, error: "ไม่สามารถบันทึกการชำระได้" };
  }

  const { error: allocError } = await supabase.from("payment_allocations").insert(
    allocations.map((a) => ({
      payment_id: payment.id,
      invoice_id: a.invoiceId,
      amount: a.amount,
    })),
  );

  if (allocError) {
    await supabase.from("payments").delete().eq("id", payment.id);
    return { ok: false, error: "ไม่สามารถจัดสรรเงินเข้าใบแจ้งได้" };
  }

  const { error: receiptError } = await supabase.from("receipts").insert({
    payment_id: payment.id,
    receipt_number: receiptNumber,
    invoice_type_id: invoiceTypeId,
    snapshot_data: snapshot,
  });

  if (receiptError) {
    await supabase.from("payment_allocations").delete().eq("payment_id", payment.id);
    await supabase.from("payments").delete().eq("id", payment.id);
    return { ok: false, error: "ไม่สามารถออกใบเสร็จได้" };
  }

  for (const alloc of allocations) {
    const newPaid = round2(Number(invoice.paid_amount) + alloc.amount);
    const newStatus = deriveInvoiceStatus(newPaid, Number(invoice.total_amount));

    const { error: updateError } = await supabase
      .from("student_invoices")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", alloc.invoiceId);

    if (updateError) {
      return { ok: false, error: "ไม่สามารถอัปเดตยอดใบแจ้งได้" };
    }
  }

  revalidateFinancePaths();
  return { ok: true, paymentId: payment.id, receiptNumber, snapshot };
}

export async function getStudentOutstandingAction(studentId: string, semesterId: string) {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;
  const invoices = await getStudentOutstandingInvoices(studentId, semesterId);
  return { ok: true as const, invoices };
}

export type ImportPreviewStudent = {
  studentCode: string;
  studentId: string;
  name: string;
  outstanding: number;
};

export async function getImportPreviewDataAction(
  studentCodes: string[],
  semesterId: string,
) {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const codes = [...new Set(studentCodes.map((c) => c.trim()).filter(Boolean))];
  if (codes.length === 0) {
    return { ok: true as const, students: [] as ImportPreviewStudent[] };
  }

  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .in("student_code", codes);

  const studentRows = students ?? [];
  const studentIds = studentRows.map((s) => s.id);

  const outstandingByStudent = new Map<string, number>();
  if (studentIds.length > 0) {
    const { data: invoices } = await supabase
      .from("student_invoices")
      .select("student_id, total_amount, paid_amount")
      .in("student_id", studentIds)
      .eq("semester_id", semesterId)
      .in("status", ["unpaid", "partial"]);

    for (const inv of invoices ?? []) {
      const due = Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount));
      outstandingByStudent.set(
        inv.student_id,
        round2((outstandingByStudent.get(inv.student_id) ?? 0) + due),
      );
    }
  }

  const result: ImportPreviewStudent[] = studentRows.map((s) => ({
    studentCode: s.student_code,
    studentId: s.id,
    name: formatStudentName(s.first_name, s.last_name),
    outstanding: outstandingByStudent.get(s.id) ?? 0,
  }));

  return { ok: true as const, students: result };
}

export type ImportRowInput = {
  lineNumber: number;
  studentCode: string;
  csvName: string;
  amount: number;
  paidDateIso: string; // "YYYY-MM-DD"
};

export type ImportBackfillResult = {
  ok: true;
  imported: number;
  failed: { lineNumber: number; studentCode: string; reason: string }[];
};

export async function importPaymentsBackfill(input: {
  rows: ImportRowInput[];
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
}): Promise<ImportBackfillResult | { ok: false; error: string }> {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  // Process oldest payment first so receipt numbers run in date order.
  const rows = [...input.rows].sort((a, b) =>
    a.paidDateIso.localeCompare(b.paidDateIso),
  );

  const [{ data: existingReceipts }, invoiceTypeId, gradeByStudent] = await Promise.all([
    supabase.from("payments").select("receipt_number").eq("academic_year_id", input.academicYearId),
    getDefaultInvoiceTypeId(),
    getStudentGradeMap(input.semesterId),
  ]);

  if (!invoiceTypeId) return { ok: false, error: "ไม่พบประเภทใบแจ้งเริ่มต้น" };

  let nextSeq =
    parseMaxSequence(
      (existingReceipts ?? []).map((r) => r.receipt_number),
      input.academicYearName,
    ) + 1;

  // Resolve all student codes up front.
  const codes = [...new Set(rows.map((r) => r.studentCode))];
  const { data: students } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .in("student_code", codes);
  const studentByCode = new Map(
    (students ?? []).map((s) => [s.student_code, s]),
  );

  const failed: ImportBackfillResult["failed"] = [];
  let imported = 0;

  for (const row of rows) {
    const student = studentByCode.get(row.studentCode);
    if (!student) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ไม่พบรหัสนักเรียน" });
      continue;
    }

    const outstanding = await getStudentOutstandingInvoices(student.id, input.semesterId);
    const totalDue = outstanding.reduce((sum, inv) => sum + inv.outstanding, 0);

    if (row.amount <= 0) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ยอดเงินไม่ถูกต้อง" });
      continue;
    }
    if (totalDue <= 0) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ไม่มียอดค้างชำระ" });
      continue;
    }
    if (row.amount > round2(totalDue) + 0.005) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ยอดเกินยอดค้าง" });
      continue;
    }

    const allocations = allocatePaymentFifo(
      row.amount,
      outstanding.map((inv) => ({ id: inv.id, createdAt: inv.createdAt, outstanding: inv.outstanding })),
    );
    if (allocations.length === 0) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "จัดสรรเงินไม่ได้" });
      continue;
    }

    const receiptNumber = formatReceiptNumber(input.academicYearName, nextSeq);
    const paidTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
    const paidAt = `${row.paidDateIso}T12:00:00+07:00`;
    const gradeClassroom = gradeByStudent.get(student.id) ?? "—";

    // Derive the receipt type from the (FIFO-first) invoice this row settles;
    // fall back to the default type for any row we can't match.
    const { data: primaryInvoice } = await supabase
      .from("student_invoices")
      .select("invoice_type_id")
      .eq("id", allocations[0].invoiceId)
      .maybeSingle();
    const rowInvoiceTypeId = primaryInvoice?.invoice_type_id ?? invoiceTypeId;

    const snapshot: Record<string, unknown> = {
      receiptNumber,
      paidAt,
      studentCode: student.student_code,
      studentName: formatStudentName(student.first_name, student.last_name),
      gradeClassroom,
      paymentMethod: "cash",
      transferReference: null,
      amount: paidTotal,
      allocations: allocations.map((a) => {
        const inv = outstanding.find((i) => i.id === a.invoiceId)!;
        return { invoiceId: a.invoiceId, invoiceName: inv.invoiceName, amount: a.amount };
      }),
      recordedBy: auth.profile.display_name ?? "เจ้าหน้าที่",
    };

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        receipt_number: receiptNumber,
        student_id: student.id,
        academic_year_id: input.academicYearId,
        amount: paidTotal,
        payment_method: "cash",
        transfer_reference: null,
        paid_at: paidAt,
        recorded_by: auth.profile.id,
        note: "นำเข้าย้อนหลัง",
        status: "active",
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "บันทึกการชำระไม่ได้" });
      continue;
    }

    const { error: allocError } = await supabase.from("payment_allocations").insert(
      allocations.map((a) => ({ payment_id: payment.id, invoice_id: a.invoiceId, amount: a.amount })),
    );
    if (allocError) {
      await supabase.from("payments").delete().eq("id", payment.id);
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "จัดสรรเข้าใบแจ้งไม่ได้" });
      continue;
    }

    const { error: receiptError } = await supabase.from("receipts").insert({
      payment_id: payment.id,
      receipt_number: receiptNumber,
      invoice_type_id: rowInvoiceTypeId,
      snapshot_data: snapshot,
    });
    if (receiptError) {
      await supabase.from("payment_allocations").delete().eq("payment_id", payment.id);
      await supabase.from("payments").delete().eq("id", payment.id);
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ออกใบเสร็จไม่ได้" });
      continue;
    }

    let invoiceUpdateError = false;
    for (const alloc of allocations) {
      const inv = outstanding.find((i) => i.id === alloc.invoiceId)!;
      const newPaid = round2(inv.paidAmount + alloc.amount);
      const { error: updateError } = await supabase
        .from("student_invoices")
        .update({ paid_amount: newPaid, status: deriveInvoiceStatus(newPaid, inv.totalAmount) })
        .eq("id", alloc.invoiceId);
      if (updateError) {
        invoiceUpdateError = true;
        break;
      }
    }

    // The payment + receipt are already committed at this point. If the invoice
    // balance update failed, surface the row so the operator can reconcile by
    // hand rather than silently leaving outstanding stale (which would also
    // defeat the re-import guard that relies on outstanding reaching 0).
    if (invoiceUpdateError) {
      failed.push({
        lineNumber: row.lineNumber,
        studentCode: row.studentCode,
        reason: "อัปเดตยอดใบแจ้งไม่ได้ (ออกใบเสร็จแล้ว ตรวจสอบด้วยตนเอง)",
      });
      nextSeq += 1;
      continue;
    }

    nextSeq += 1;
    imported += 1;
  }

  revalidateFinancePaths();

  return { ok: true, imported, failed };
}

export async function searchStudentsForPaymentAction(
  semesterId: string,
  options: {
    query?: string;
    gradeLevelId?: string;
    classroomId?: string;
  },
) {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;
  const students = await searchStudentsForPayment(semesterId, options);
  return { ok: true as const, students };
}

export async function voidPayment(paymentId: string, reason: string): Promise<ActionState> {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { ok: false, error: "กรุณาระบุเหตุผล" };

  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, status")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) return { ok: false, error: "ไม่พบรายการชำระ" };
  if (payment.status !== "active") {
    return { ok: false, error: "รายการนี้ถูกยกเลิกแล้ว" };
  }

  const { data: allocations } = await supabase
    .from("payment_allocations")
    .select("invoice_id, amount")
    .eq("payment_id", paymentId);

  for (const alloc of allocations ?? []) {
    const { data: invoice } = await supabase
      .from("student_invoices")
      .select("paid_amount, total_amount")
      .eq("id", alloc.invoice_id)
      .maybeSingle();

    if (!invoice) continue;

    const newPaid = round2(Math.max(0, Number(invoice.paid_amount) - Number(alloc.amount)));
    const newStatus = deriveInvoiceStatus(newPaid, Number(invoice.total_amount));

    await supabase
      .from("student_invoices")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", alloc.invoice_id);
  }

  const { error: voidError } = await supabase.from("payment_voids").insert({
    payment_id: paymentId,
    voided_by: auth.profile.id,
    reason: trimmedReason,
  });

  if (voidError) return { ok: false, error: "ไม่สามารถบันทึกการยกเลิกได้" };

  const { error: statusError } = await supabase
    .from("payments")
    .update({ status: "voided" })
    .eq("id", paymentId);

  if (statusError) return { ok: false, error: "ไม่สามารถยกเลิกใบเสร็จได้" };

  revalidateFinancePaths();
  return { ok: true };
}

function revalidateFinancePaths() {
  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath("/reports/outstanding");
  revalidatePath("/reports/collections");
  revalidatePath("/");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
