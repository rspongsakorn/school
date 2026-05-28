import { createClient } from "@/lib/supabase/server";

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
    student_invoices: {
      semesters: { number: number } | null;
      invoice_lines: Array<{
        amount: string;
        fee_items: { name: string } | null;
      }>;
    } | null;
  }>;
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
        student_invoices (
          semesters ( number ),
          invoice_lines ( amount, fee_items ( name ) )
        )
      )
    `,
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (!raw) return null;

  const payment = raw as unknown as RawPayment;
  const snapshot = payment.receipts?.snapshot_data ?? {};

  const lineItems = (payment.payment_allocations ?? [])
    .flatMap((pa) => pa.student_invoices?.invoice_lines ?? [])
    .map((line) => ({
      name: line.fee_items?.name ?? "รายการค่าธรรมเนียม",
      amount: Number(line.amount),
    }));

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
  };
}
