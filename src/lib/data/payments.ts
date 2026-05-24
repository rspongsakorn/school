import { formatStudentName, formatThaiDate } from "@/lib/format";
import { getStudentGradeMap } from "@/lib/data/enrollments";
import { buildStudentSearchOrFilter } from "@/lib/students/search";
import { createClient } from "@/lib/supabase/server";

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
}): Promise<string[]> {
  const supabase = await createClient();

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

  const { data } = await query;
  const ids = [...new Set((data ?? []).map((row) => row.student_id))];
  return ids;
}

export async function listPaymentsFiltered(params: {
  academicYearId: string;
  semesterId: string;
  gradeLevelId?: string;
  classroomId?: string;
}): Promise<PaymentListRow[]> {
  const supabase = await createClient();
  const gradeByStudent = await getStudentGradeMap(params.semesterId);

  const studentIds = await studentIdsForPaymentFilter({
    semesterId: params.semesterId,
    gradeLevelId: params.gradeLevelId,
    classroomId: params.classroomId,
  });

  if (studentIds && studentIds.length === 0) {
    return [];
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
    )
    .eq("academic_year_id", params.academicYearId)
    .order("paid_at", { ascending: false });

  if (studentIds) {
    query = query.in("student_id", studentIds);
  }

  const { data: payments } = await query;

  return mapPaymentRows((payments ?? []) as unknown as PaymentQueryRow[], gradeByStudent);
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

export async function searchStudentsForPayment(
  semesterId: string,
  options: SearchStudentsForPaymentOptions,
): Promise<StudentSearchHit[]> {
  const q = options.query?.trim() ?? "";
  const hasScope = Boolean(options.gradeLevelId || options.classroomId);

  if (!q && !hasScope) return [];
  if (q.length > 0 && q.length < 2 && !hasScope) return [];

  const gradeByStudent = await getStudentGradeMap(semesterId);

  let studentIds: string[] | undefined;
  if (hasScope) {
    const scopedIds = await studentIdsForPaymentFilter({
      semesterId,
      gradeLevelId: options.gradeLevelId,
      classroomId: options.classroomId,
    });
    if (scopedIds.length === 0) return [];
    studentIds = scopedIds;
  }

  const supabase = await createClient();
  let studentQuery = supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .eq("status", "active")
    .order("student_code", { ascending: true })
    .limit(50);

  if (studentIds) {
    studentQuery = studentQuery.in("id", studentIds);
  }

  const searchFilter = q.length >= 2 ? buildStudentSearchOrFilter(q) : "";
  if (searchFilter) {
    studentQuery = studentQuery.or(searchFilter);
  }

  const { data } = await studentQuery;

  return (data ?? []).map((s) => ({
    id: s.id,
    studentCode: s.student_code,
    name: formatStudentName(s.first_name, s.last_name),
    gradeClassroom: gradeByStudent.get(s.id) ?? "—",
  }));
}
