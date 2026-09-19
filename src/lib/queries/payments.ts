import { formatStudentName, formatThaiDate, formatThaiDateLong } from "@/lib/format";
import { buildStudentSearchOrFilter } from "@/lib/students/search";
import { createClient } from "@/lib/supabase/client";
import { computeReceiptLineItems, type ReceiptLineItem, type ReceiptDiscount } from "@/lib/finance/receipt-line-items";

async function getStudentGradeMap(
  semesterId: string,
  opts: { studentIds?: string[]; signal?: AbortSignal } = {},
): Promise<Map<string, string>> {
  const supabase = createClient();
  let query = supabase
    .from("student_enrollments")
    .select("student_id, classrooms(name, grade_levels(name))")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");
  if (opts.studentIds) query = query.in("student_id", opts.studentIds);
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data } = await query;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as unknown as {
    student_id: string;
    classrooms: { name: string; grade_levels: { name: string } | null } | null;
  }[]) {
    const grade = row.classrooms?.grade_levels?.name ?? null;
    const classroom = row.classrooms?.name ?? null;
    if (grade && classroom) map.set(row.student_id, `${grade}/${classroom}`);
    else if (grade) map.set(row.student_id, grade);
  }
  return map;
}

export type PaymentListRow = {
  id: string;
  receiptNumber: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  amount: number;
  paymentMethod: "cash" | "transfer";
  paidAt: string;
  paidAtLabel: string;
  status: "active" | "voided";
  snapshot: Record<string, unknown> | null;
};

type PaymentQueryRow = {
  id: string;
  receipt_number: string;
  student_id: string;
  amount: number;
  payment_method: "cash" | "transfer";
  paid_at: string;
  status: "active" | "voided";
  students: { student_code: string; first_name: string; last_name: string };
  receipts: { snapshot_data: Record<string, unknown> } | null;
};

function mapPaymentRows(
  payments: PaymentQueryRow[],
  gradeByStudent: Map<string, string>,
): PaymentListRow[] {
  return payments.map((row) => ({
    id: row.id,
    receiptNumber: row.receipt_number,
    studentId: row.student_id,
    studentCode: row.students.student_code,
    studentName: formatStudentName(row.students.first_name, row.students.last_name),
    gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    paidAtLabel: formatThaiDate(row.paid_at),
    status: row.status,
    snapshot: row.receipts?.snapshot_data ?? null,
  }));
}

async function studentIdsForPaymentFilter(params: {
  semesterId: string;
  gradeLevelId?: string;
  classroomId?: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const supabase = createClient();

  let query = supabase
    .from("student_enrollments")
    .select("student_id, classroom_id, classrooms!inner(grade_level_id)")
    .eq("semester_id", params.semesterId)
    .eq("status", "enrolled");

  if (params.classroomId) {
    query = query.eq("classroom_id", params.classroomId);
  } else if (params.gradeLevelId) {
    query = query.eq("classrooms.grade_level_id", params.gradeLevelId);
  }

  if (params.signal) query = query.abortSignal(params.signal);

  const { data } = await query;
  const ids = [...new Set((data ?? []).map((row) => row.student_id))];
  return ids;
}

export const PAYMENTS_PAGE_SIZE = 20;

export type PaymentsPage = { rows: PaymentListRow[]; total: number };

export async function fetchPaymentsFiltered(params: {
  academicYearId: string;
  semesterId: string;
  gradeLevelId?: string;
  classroomId?: string;
  search?: string;
  page: number;
  pageSize?: number;
}): Promise<PaymentsPage> {
  const supabase = createClient();
  const pageSize = params.pageSize ?? PAYMENTS_PAGE_SIZE;
  const from = (params.page - 1) * pageSize;

  const hasFilter = Boolean(params.gradeLevelId || params.classroomId);

  // Only fetch student IDs when a grade/classroom filter is active —
  // passing 800+ IDs into an IN clause exceeds PostgREST URL limits.
  let studentIds: string[] | null = null;
  if (hasFilter) {
    const ids = await studentIdsForPaymentFilter({
      semesterId: params.semesterId,
      gradeLevelId: params.gradeLevelId,
      classroomId: params.classroomId,
    });
    if (ids.length === 0) return { rows: [], total: 0 };
    studentIds = ids;
  }

  let query = supabase
    .from("payments")
    .select(
      `
      id,
      receipt_number,
      student_id,
      amount,
      payment_method,
      paid_at,
      status,
      students!inner ( student_code, first_name, last_name ),
      receipts ( snapshot_data )
    `,
      { count: "exact" },
    )
    .eq("academic_year_id", params.academicYearId)
    .order("paid_at", { ascending: false })
    // Tie-breaker: imported payments share one paid_at, and without a unique
    // sort key .range() pages can repeat or skip rows.
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (studentIds) {
    query = query.in("student_id", studentIds);
  }

  // Every whitespace-separated word must match the code, first or last name,
  // so a full name like "first last" still finds the student.
  for (const word of params.search?.split(/\s+/) ?? []) {
    const searchFilter = buildStudentSearchOrFilter(word);
    if (searchFilter) query = query.or(searchFilter, { referencedTable: "students" });
  }

  const { data: payments, count } = await query;
  const rows = (payments ?? []) as unknown as PaymentQueryRow[];

  // Label only this page's students instead of the whole semester's enrollments.
  const gradeByStudent =
    rows.length > 0
      ? await getStudentGradeMap(params.semesterId, {
          studentIds: [...new Set(rows.map((r) => r.student_id))],
        })
      : new Map<string, string>();

  return { rows: mapPaymentRows(rows, gradeByStudent), total: count ?? rows.length };
}

export type PaymentDetail = {
  receiptNumber: string;
  paidAtLabel: string;
  paymentMethod: "cash" | "transfer";
  academicYearName: string;
  semesterNumber: number;
  studentName: string;
  studentCode: string;
  gradeClassroom: string;
  recordedBy: string;
  lineItems: ReceiptLineItem[];
  subtotal: number;
  discounts: ReceiptDiscount[];
};

type PaymentDetailQueryRow = {
  receipt_number: string;
  payment_method: "cash" | "transfer";
  paid_at: string;
  academic_years: { name: string } | null;
  receipts: {
    snapshot_data: {
      studentName?: string;
      studentCode?: string;
      gradeClassroom?: string;
      recordedBy?: string;
    };
  } | null;
  payment_allocations: Array<{
    amount: string;
    student_invoices: {
      invoice_types: { name: string } | null;
      semesters: { number: number } | null;
      invoice_lines: Array<{ amount: string; fee_items: { name: string } | null }>;
    } | null;
  }>;
  payment_discounts: Array<{ amount: string; fee_items: { name: string } | null }>;
};

export async function fetchPaymentDetail(paymentId: string): Promise<PaymentDetail | null> {
  const supabase = createClient();

  const { data: raw } = await supabase
    .from("payments")
    .select(
      `
      receipt_number,
      payment_method,
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
  const payment = raw as unknown as PaymentDetailQueryRow;
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
    paidAtLabel: formatThaiDateLong(payment.paid_at),
    paymentMethod: payment.payment_method,
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

export type StudentSearchHit = {
  id: string;
  studentCode: string;
  name: string;
  gradeClassroom: string;
};

export type SearchStudentsForPaymentOptions = {
  query?: string;
  gradeLevelId?: string;
  classroomId?: string;
};

/**
 * Browser-side student search. Pass `signal` to abort the in-flight requests
 * when a newer search starts; an aborted supabase call yields no data, so this
 * resolves to `[]` (callers must ignore results once `signal.aborted`).
 */
export async function searchStudentsForPayment(
  semesterId: string,
  options: SearchStudentsForPaymentOptions,
  signal?: AbortSignal,
): Promise<StudentSearchHit[]> {
  const q = options.query?.trim() ?? "";
  const hasScope = Boolean(options.gradeLevelId || options.classroomId);

  if (!q && !hasScope) return [];
  if (q.length > 0 && q.length < 2 && !hasScope) return [];

  let studentIds: string[] | undefined;
  if (hasScope) {
    const scopedIds = await studentIdsForPaymentFilter({
      semesterId,
      gradeLevelId: options.gradeLevelId,
      classroomId: options.classroomId,
      signal,
    });
    if (scopedIds.length === 0) return [];
    studentIds = scopedIds;
  }

  const supabase = createClient();
  let studentQuery = supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .eq("status", "active")
    .order("student_code", { ascending: true })
    .limit(50);

  if (signal) studentQuery = studentQuery.abortSignal(signal);

  if (studentIds) {
    studentQuery = studentQuery.in("id", studentIds);
  }

  const searchFilter = q.length >= 2 ? buildStudentSearchOrFilter(q) : "";
  if (searchFilter) {
    studentQuery = studentQuery.or(searchFilter);
  }

  const { data } = await studentQuery;
  if (!data || data.length === 0) return [];

  // Label only the (≤50) hits instead of loading the whole semester's enrollments.
  const gradeByStudent = await getStudentGradeMap(semesterId, {
    studentIds: data.map((s) => s.id),
    signal,
  });

  return data.map((s) => ({
    id: s.id,
    studentCode: s.student_code,
    name: formatStudentName(s.first_name, s.last_name),
    gradeClassroom: gradeByStudent.get(s.id) ?? "—",
  }));
}
