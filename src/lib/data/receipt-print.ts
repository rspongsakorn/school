import { createClient } from "@/lib/supabase/server";
import { computeReceiptLineItems } from "@/lib/finance/receipt-line-items";

export type ReceiptPrintData = {
  receiptNumber: string;
  paidAt: string;
  paymentMethod: "cash" | "transfer";
  transferReference: string | null;
  amount: number;
  academicYearName: string;
  semesterNumber: number;
  studentName: string;
  studentCode: string;
  gradeClassroom: string;
  recordedBy: string;
  lineItems: { name: string; amount: number }[];
  subtotal: number;
  discounts: { name: string; amount: number }[];
};

type SnapshotData = {
  studentName?: string;
  studentCode?: string;
  gradeClassroom?: string;
  recordedBy?: string;
};

type RawPayment = {
  receipt_number: string;
  amount: string;
  payment_method: "cash" | "transfer";
  transfer_reference: string | null;
  paid_at: string;
  academic_years: { name: string } | null;
  receipts: { snapshot_data: SnapshotData } | null;
  payment_allocations: Array<{
    amount: string;
    student_invoices: {
      invoice_types: { name: string } | null;
      semesters: { number: number } | null;
      invoice_lines: Array<{
        amount: string;
        fee_items: { name: string } | null;
      }>;
    } | null;
  }>;
  payment_discounts: Array<{ amount: string; fee_items: { name: string } | null }>;
};

export async function getReceiptPrintData(
  paymentId: string,
): Promise<ReceiptPrintData | null> {
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("payments")
    .select(
      `
      receipt_number,
      amount,
      payment_method,
      transfer_reference,
      paid_at,
      academic_years ( name ),
      receipts ( snapshot_data ),
      payment_allocations (
        amount,
        student_invoices (
          invoice_types ( name ),
          semesters ( number ),
          invoice_lines ( amount, fee_items ( name ) )
        )
      ),
      payment_discounts (
        amount,
        fee_items ( name )
      )
    `,
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (!raw) return null;

  const payment = raw as unknown as RawPayment;
  const snapshot = payment.receipts?.snapshot_data ?? {};

  const { lineItems, subtotal, discounts } = computeReceiptLineItems(
    payment.payment_allocations ?? [],
    payment.payment_discounts ?? [],
  );

  const semesterNumber =
    (payment.payment_allocations ?? [])
      .map((pa) => pa.student_invoices?.semesters?.number)
      .find((n) => n != null) ?? 1;

  return {
    receiptNumber: payment.receipt_number,
    paidAt: payment.paid_at,
    paymentMethod: payment.payment_method,
    transferReference: payment.transfer_reference,
    amount: Number(payment.amount),
    academicYearName: payment.academic_years?.name ?? "—",
    semesterNumber,
    studentName: snapshot.studentName ?? "—",
    studentCode: snapshot.studentCode ?? "—",
    gradeClassroom: snapshot.gradeClassroom ?? "—",
    recordedBy: snapshot.recordedBy ?? "—",
    lineItems,
    subtotal,
    discounts,
  };
}
