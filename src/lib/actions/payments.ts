"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireFinanceAction } from "@/lib/auth/require-finance";
import {
  allocatePaymentFifo,
  deriveInvoiceStatus,
} from "@/lib/finance/amounts";
import { getStudentOutstandingInvoices } from "@/lib/data/invoices";
import { getDefaultInvoiceTypeId } from "@/lib/data/invoice-types";
import { resolveSingleInvoicePayment } from "@/lib/finance/single-invoice-allocation";
import { resolvePaymentDiscounts } from "@/lib/finance/payment-discount";
import { createClient } from "@/lib/supabase/server";
import { formatStudentName } from "@/lib/format";
import { searchStudentsForPayment } from "@/lib/data/payments";
import { getStudentGradeMap } from "@/lib/data/enrollments";
import type { InvoiceCandidate } from "@/lib/finance/xlsx-import";

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
  discounts?: {
    invoiceLineId: string;
    discountType: "percent" | "fixed";
    discountValue: number;
  }[];
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
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    invoice_type_id: string | null;
    student_id: string;
    invoice_types: { name: string } | null;
    invoice_lines: { id: string; fee_item_id: string; amount: number }[];
  };

  const { data: invoice } = await supabase
    .from("student_invoices")
    .select(
      "id, subtotal, total_amount, paid_amount, invoice_type_id, student_id, invoice_types ( name ), invoice_lines ( id, fee_item_id, amount )",
    )
    .eq("id", input.invoiceId)
    .maybeSingle() as unknown as { data: InvoiceRow | null };

  if (!invoice) return { ok: false, error: "ไม่พบใบแจ้งชำระ" };
  if (invoice.student_id !== input.studentId) {
    return { ok: false, error: "ใบแจ้งชำระไม่ตรงกับนักเรียน" };
  }

  const discountInput = input.discounts ?? [];
  let resolvedDiscounts: { invoiceLineId: string; feeItemId: string; discountType: "percent" | "fixed"; discountValue: number; amount: number }[] = [];
  let netTotal = Number(invoice.total_amount);

  if (discountInput.length > 0) {
    if (Number(invoice.paid_amount) > 0) {
      return { ok: false, error: "ให้ส่วนลดได้เฉพาะใบแจ้งที่ยังไม่ชำระ" };
    }
    const discountResult = resolvePaymentDiscounts(
      Number(invoice.subtotal),
      (invoice.invoice_lines ?? []).map((l) => ({ id: l.id, feeItemId: l.fee_item_id, amount: Number(l.amount) })),
      discountInput,
    );
    if (!discountResult.ok) return { ok: false, error: discountResult.error };
    resolvedDiscounts = discountResult.rows;
    netTotal = discountResult.netDue;
  }

  if (resolvedDiscounts.length > 0 && round2(input.amount) !== round2(netTotal)) {
    return { ok: false, error: "เมื่อมีส่วนลด ต้องชำระเต็มยอดสุทธิ" };
  }

  const outstanding = Math.max(
    0,
    Math.round((netTotal - Number(invoice.paid_amount)) * 100) / 100,
  );

  const resolved = resolveSingleInvoicePayment({ amount: input.amount, outstanding });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const invoiceTypeId = invoice.invoice_type_id;
  if (!invoiceTypeId) return { ok: false, error: "ใบแจ้งชำระไม่มีประเภทใบแจ้ง" };

  const paidTotal = resolved.amount;
  const newPaid = round2(Number(invoice.paid_amount) + paidTotal);

  const { data: student } = await supabase
    .from("students")
    .select("student_code, first_name, last_name")
    .eq("id", input.studentId)
    .maybeSingle();

  if (!student) return { ok: false, error: "ไม่พบนักเรียน" };

  const gradeByStudent = await getStudentGradeMap(input.semesterId);
  const gradeClassroom = gradeByStudent.get(input.studentId) ?? "—";

  const invoiceName = invoice.invoice_types?.name ?? "—";

  // The receipt number is assigned inside the RPC (under an advisory lock) and
  // stamped back into the snapshot there; the placeholder here is overwritten.
  const snapshot: Record<string, unknown> = {
    receiptNumber: "",
    paidAt: new Date().toISOString(),
    studentCode: student.student_code,
    studentName: formatStudentName(student.first_name, student.last_name),
    gradeClassroom,
    paymentMethod: input.paymentMethod,
    transferReference: input.transferReference?.trim() || null,
    amount: paidTotal,
    allocations: [{ invoiceId: invoice.id, invoiceName, amount: paidTotal }],
    recordedBy: auth.profile.display_name ?? "เจ้าหน้าที่",
  };

  // Record everything (payment, allocation, discounts, receipt, invoice update)
  // atomically in one transaction so a mid-way failure can't leave a committed
  // receipt against an un-updated invoice balance.
  const { data: rpcRows, error: rpcError } = await supabase.rpc("record_payment", {
    p_invoice_id: invoice.id,
    p_student_id: input.studentId,
    p_academic_year_id: input.academicYearId,
    p_academic_year_name: input.academicYearName,
    p_amount: paidTotal,
    p_net_total: netTotal,
    p_new_paid: newPaid,
    p_payment_method: input.paymentMethod,
    p_transfer_reference: input.transferReference?.trim() || null,
    p_note: input.note?.trim() || null,
    p_recorded_by: auth.profile.id,
    p_invoice_type_id: invoiceTypeId,
    p_snapshot: snapshot,
    p_discounts: resolvedDiscounts.map((d) => ({
      invoiceLineId: d.invoiceLineId,
      feeItemId: d.feeItemId,
      discountType: d.discountType,
      discountValue: d.discountValue,
      amount: d.amount,
    })),
  });

  const result = rpcRows?.[0];
  if (rpcError || !result) {
    return { ok: false, error: "ไม่สามารถบันทึกการชำระได้" };
  }

  snapshot.receiptNumber = result.receipt_number;

  revalidateFinancePaths();
  return {
    ok: true,
    paymentId: result.payment_id,
    receiptNumber: result.receipt_number,
    snapshot,
  };
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

export type XlsxImportPreviewStudent = {
  studentCode: string;
  studentId: string;
  name: string;
  invoices: InvoiceCandidate[];
};

export async function getXlsxImportPreviewAction(
  studentCodes: string[],
  semesterId: string,
) {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const codes = [...new Set(studentCodes.map((c) => c.trim()).filter(Boolean))];
  if (codes.length === 0) {
    return { ok: true as const, students: [] as XlsxImportPreviewStudent[] };
  }

  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .in("student_code", codes);

  const studentRows = students ?? [];
  const studentIds = studentRows.map((s) => s.id);

  type InvoiceRow = {
    id: string;
    student_id: string;
    total_amount: number;
    status: "unpaid" | "partial" | "paid";
    is_reimbursable: boolean;
    invoice_lines: { fee_items: { name: string } | null }[] | null;
  };

  const invoicesByStudent = new Map<string, InvoiceCandidate[]>();
  if (studentIds.length > 0) {
    const { data: invoices } = await supabase
      .from("student_invoices")
      .select(
        "id, student_id, total_amount, status, is_reimbursable, invoice_lines(fee_items(name))",
      )
      .in("student_id", studentIds)
      .eq("semester_id", semesterId) as unknown as { data: InvoiceRow[] | null };

    for (const inv of invoices ?? []) {
      const candidate: InvoiceCandidate = {
        id: inv.id,
        isReimbursable: inv.is_reimbursable,
        totalAmount: Number(inv.total_amount),
        status: inv.status,
        feeItemNames: (inv.invoice_lines ?? [])
          .map((l) => l.fee_items?.name)
          .filter((n): n is string => Boolean(n)),
      };
      const list = invoicesByStudent.get(inv.student_id) ?? [];
      list.push(candidate);
      invoicesByStudent.set(inv.student_id, list);
    }
  }

  const result: XlsxImportPreviewStudent[] = studentRows.map((s) => ({
    studentCode: s.student_code,
    studentId: s.id,
    name: formatStudentName(s.first_name, s.last_name),
    invoices: invoicesByStudent.get(s.id) ?? [],
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

  const [invoiceTypeId, gradeByStudent] = await Promise.all([
    getDefaultInvoiceTypeId(),
    getStudentGradeMap(input.semesterId),
  ]);

  if (!invoiceTypeId) return { ok: false, error: "ไม่พบประเภทใบแจ้งเริ่มต้น" };

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

    const paidTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
    const paidAt = `${row.paidDateIso}T12:00:00+07:00`;
    const gradeClassroom = gradeByStudent.get(student.id) ?? "—";

    // Derive the invoice type from the (FIFO-first) invoice this row settles;
    // fall back to the default type for any row we can't match.
    const { data: primaryInvoice } = await supabase
      .from("student_invoices")
      .select("invoice_type_id")
      .eq("id", allocations[0].invoiceId)
      .maybeSingle();
    const rowInvoiceTypeId = primaryInvoice?.invoice_type_id ?? invoiceTypeId;

    // The receipt number is issued inside the RPC (under an advisory lock) and
    // stamped into the snapshot there; the placeholder here is overwritten.
    const snapshot: Record<string, unknown> = {
      receiptNumber: "",
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

    // One transaction per row: payment + allocations + receipt + invoice
    // balance updates all commit together (or not at all), with the receipt
    // number issued under the per-year advisory lock so concurrent imports
    // can't collide.
    const { error: rpcError } = await supabase.rpc("record_backfill_payment", {
      p_student_id: student.id,
      p_academic_year_id: input.academicYearId,
      p_academic_year_name: input.academicYearName,
      p_amount: paidTotal,
      p_paid_at: paidAt,
      p_recorded_by: auth.profile.id,
      p_note: "นำเข้าย้อนหลัง",
      p_invoice_type_id: rowInvoiceTypeId,
      p_snapshot: snapshot,
      p_allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
    });

    if (rpcError) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "บันทึกการชำระไม่ได้" });
      continue;
    }

    imported += 1;
  }

  revalidateFinancePaths();

  return { ok: true, imported, failed };
}

export type XlsxImportGroupInput = {
  rowNumber: number;
  kind: "tuition" | "insurance";
  invoiceId: string;
  studentId: string;
  studentCode: string;
  netCash: number;
  discount: number;
  voucher: string | null;
  paidDateIso: string;
};

export type XlsxImportResult = {
  ok: true;
  imported: number;
  failed: { rowNumber: number; studentCode: string; reason: string }[];
};

export async function importPaymentsXlsxBackfill(input: {
  groups: XlsxImportGroupInput[];
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
}): Promise<XlsxImportResult | { ok: false; error: string }> {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const groups = [...input.groups].sort((a, b) =>
    a.paidDateIso.localeCompare(b.paidDateIso),
  );

  const [invoiceTypeId, gradeByStudent] = await Promise.all([
    getDefaultInvoiceTypeId(),
    getStudentGradeMap(input.semesterId),
  ]);
  if (!invoiceTypeId) return { ok: false, error: "ไม่พบประเภทใบแจ้งเริ่มต้น" };

  const failed: XlsxImportResult["failed"] = [];
  let imported = 0;

  for (const group of groups) {
    const paidAt = `${group.paidDateIso}T12:00:00+07:00`;
    const gradeClassroom = gradeByStudent.get(group.studentId) ?? "—";

    const { data: invoiceRow } = await supabase
      .from("student_invoices")
      .select("invoice_type_id, invoice_types(name)")
      .eq("id", group.invoiceId)
      .maybeSingle() as unknown as {
        data: { invoice_type_id: string; invoice_types: { name: string } | null } | null;
      };

    if (!invoiceRow) {
      failed.push({ rowNumber: group.rowNumber, studentCode: group.studentCode, reason: "ไม่พบใบแจ้งหนี้" });
      continue;
    }

    if (group.netCash > 0) {
      const { data: student } = await supabase
        .from("students")
        .select("student_code, first_name, last_name")
        .eq("id", group.studentId)
        .maybeSingle();
      if (!student) {
        failed.push({ rowNumber: group.rowNumber, studentCode: group.studentCode, reason: "ไม่พบนักเรียน" });
        continue;
      }

      const snapshot: Record<string, unknown> = {
        receiptNumber: "",
        paidAt,
        studentCode: student.student_code,
        studentName: formatStudentName(student.first_name, student.last_name),
        gradeClassroom,
        paymentMethod: "cash",
        transferReference: null,
        amount: group.netCash,
        allocations: [
          {
            invoiceId: group.invoiceId,
            invoiceName: invoiceRow.invoice_types?.name ?? "—",
            amount: group.netCash,
          },
        ],
        recordedBy: auth.profile.display_name ?? "เจ้าหน้าที่",
      };

      const { error: rpcError } = await supabase.rpc("record_backfill_payment", {
        p_student_id: group.studentId,
        p_academic_year_id: input.academicYearId,
        p_academic_year_name: input.academicYearName,
        p_amount: group.netCash,
        p_paid_at: paidAt,
        p_recorded_by: auth.profile.id,
        p_note: group.voucher,
        p_invoice_type_id: invoiceRow.invoice_type_id ?? invoiceTypeId,
        p_snapshot: snapshot,
        p_allocations: [{ invoiceId: group.invoiceId, amount: group.netCash }],
        p_discount_invoice_id: group.discount > 0 ? group.invoiceId : null,
        p_discount_value: group.discount > 0 ? group.discount : null,
      });

      if (rpcError) {
        failed.push({ rowNumber: group.rowNumber, studentCode: group.studentCode, reason: "บันทึกการชำระไม่ได้" });
        continue;
      }
    } else {
      const { error: rpcError } = await supabase.rpc("record_backfill_invoice_discount", {
        p_invoice_id: group.invoiceId,
        p_discount_value: group.discount,
        p_note: group.voucher,
        p_recorded_by: auth.profile.id,
      });

      if (rpcError) {
        failed.push({ rowNumber: group.rowNumber, studentCode: group.studentCode, reason: "บันทึกส่วนลดไม่ได้" });
        continue;
      }
    }

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

  const { data: discountRows } = await supabase
    .from("payment_discounts")
    .select("id")
    .eq("payment_id", paymentId);
  const hadDiscount = (discountRows ?? []).length > 0;

  for (const alloc of allocations ?? []) {
    const { data: invoice } = await supabase
      .from("student_invoices")
      .select("paid_amount, total_amount, subtotal")
      .eq("id", alloc.invoice_id)
      .maybeSingle();

    if (!invoice) continue;

    const restoredTotal = hadDiscount ? Number(invoice.subtotal) : Number(invoice.total_amount);
    const newPaid = round2(Math.max(0, Number(invoice.paid_amount) - Number(alloc.amount)));
    const newStatus = deriveInvoiceStatus(newPaid, restoredTotal);

    await supabase
      .from("student_invoices")
      .update({ paid_amount: newPaid, total_amount: restoredTotal, status: newStatus })
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
