import { formatStudentName, formatThaiDate } from "@/lib/format";
import { getStudentGradeMap } from "@/lib/data/enrollments";
import { createClient } from "@/lib/supabase/server";
import type { YearSemesterContext } from "@/lib/data/context";

export type RecentPaymentRow = {
  id: string;
  name: string;
  grade: string;
  amount: number;
  date: string;
  status: "ชำระแล้ว";
};

export type OverdueStudentRow = {
  id: string;
  name: string;
  grade: string;
  dueDate: string;
  amount: number;
  daysOverdue: number;
};

export type GradeStatRow = {
  grade: string;
  rate: number;
  paid: number;
  total: number;
};

export type DashboardStats = {
  totalStudents: number;
  totalCollected: number;
  paidCount: number;
  paidRate: number;
  overdueCount: number;
  overdueAmount: number;
};

export type DashboardData = {
  context: YearSemesterContext | null;
  stats: DashboardStats;
  recentPayments: RecentPaymentRow[];
  overdueStudents: OverdueStudentRow[];
  gradeStats: GradeStatRow[];
};

const emptyStats: DashboardStats = {
  totalStudents: 0,
  totalCollected: 0,
  paidCount: 0,
  paidRate: 0,
  overdueCount: 0,
  overdueAmount: 0,
};

async function getStudentNameMap(studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, string>();

  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .in("id", studentIds);

  const map = new Map<string, string>();
  for (const s of data ?? []) {
    map.set(s.id, formatStudentName(s.first_name, s.last_name));
  }
  return map;
}

export async function getDashboardData(
  context: YearSemesterContext | null,
): Promise<DashboardData> {
  if (!context) {
    return {
      context: null,
      stats: emptyStats,
      recentPayments: [],
      overdueStudents: [],
      gradeStats: [],
    };
  }

  const supabase = await createClient();
  const { academicYearId, semesterId } = context;
  const gradeByStudent = await getStudentGradeMap(semesterId);

  const [
    enrollmentsRes,
    invoicesRes,
    paymentsRes,
    recentPaymentsRes,
    overdueRes,
    gradeLevelsRes,
  ] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("student_id", { count: "exact", head: true })
      .eq("semester_id", semesterId)
      .eq("status", "enrolled"),
    supabase
      .from("student_invoices")
      .select("student_id, total_amount, paid_amount, status")
      .eq("academic_year_id", academicYearId)
      .eq("semester_id", semesterId),
    supabase
      .from("payments")
      .select("amount")
      .eq("academic_year_id", academicYearId)
      .eq("status", "active"),
    supabase
      .from("payments")
      .select("receipt_number, amount, paid_at, student_id")
      .eq("academic_year_id", academicYearId)
      .eq("status", "active")
      .order("paid_at", { ascending: false })
      .limit(5),
    supabase
      .from("student_invoices")
      .select("id, student_id, total_amount, paid_amount, created_at")
      .eq("academic_year_id", academicYearId)
      .eq("semester_id", semesterId)
      .in("status", ["unpaid", "partial"])
      .order("created_at", { ascending: true })
      .limit(10),
    supabase
      .from("grade_levels")
      .select("id, name, sort_order")
      .eq("semester_id", semesterId)
      .order("sort_order", { ascending: true }),
  ]);

  const invoices = invoicesRes.data ?? [];
  const totalStudents = enrollmentsRes.count ?? 0;
  const totalCollected = (paymentsRes.data ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  const paidCount = invoices.filter((i) => i.status === "paid").length;
  const paidRate =
    invoices.length > 0 ? Math.round((paidCount / invoices.length) * 1000) / 10 : 0;

  const overdueInvoices = invoices.filter(
    (i) => i.status === "unpaid" || i.status === "partial",
  );
  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce(
    (sum, i) => sum + (Number(i.total_amount) - Number(i.paid_amount)),
    0,
  );

  const recentRows = recentPaymentsRes.data ?? [];
  const overdueRows = overdueRes.data ?? [];
  const studentIds = [
    ...new Set([
      ...recentRows.map((r) => r.student_id),
      ...overdueRows.map((r) => r.student_id),
    ]),
  ];
  const nameByStudent = await getStudentNameMap(studentIds);

  const recentPayments: RecentPaymentRow[] = recentRows.map((row) => ({
    id: row.receipt_number,
    name: nameByStudent.get(row.student_id) ?? "—",
    grade: gradeByStudent.get(row.student_id) ?? "—",
    amount: Number(row.amount),
    date: formatThaiDate(row.paid_at),
    status: "ชำระแล้ว",
  }));

  const now = Date.now();
  const overdueStudents: OverdueStudentRow[] = overdueRows.map((row) => {
    const outstanding = Number(row.total_amount) - Number(row.paid_amount);
    const created = new Date(row.created_at);
    const daysOverdue = Math.max(
      0,
      Math.floor((now - created.getTime()) / 86_400_000),
    );

    return {
      id: row.id,
      name: nameByStudent.get(row.student_id) ?? "—",
      grade: gradeByStudent.get(row.student_id) ?? "—",
      dueDate: formatThaiDate(created),
      amount: outstanding,
      daysOverdue,
    };
  });

  const gradeLevels = gradeLevelsRes.data ?? [];
  const gradeStats: GradeStatRow[] = await Promise.all(
    gradeLevels.map(async (gl) => {
      const { data: classrooms } = await supabase
        .from("classrooms")
        .select("id")
        .eq("grade_level_id", gl.id)
        .eq("semester_id", semesterId);

      const classroomIds = (classrooms ?? []).map((c) => c.id);
      if (classroomIds.length === 0) {
        return { grade: gl.name, rate: 0, paid: 0, total: 0 };
      }

      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id")
        .eq("semester_id", semesterId)
        .eq("status", "enrolled")
        .in("classroom_id", classroomIds);

      const studentIdsForGrade = (enrollments ?? []).map((e) => e.student_id);
      const total = studentIdsForGrade.length;

      if (total === 0) {
        return { grade: gl.name, rate: 0, paid: 0, total: 0 };
      }

      const { data: gradeInvoices } = await supabase
        .from("student_invoices")
        .select("student_id, status")
        .eq("academic_year_id", academicYearId)
        .eq("semester_id", semesterId)
        .in("student_id", studentIdsForGrade);

      const allPaidByStudent = new Map<string, boolean>();
      for (const inv of gradeInvoices ?? []) {
        const soFar = allPaidByStudent.get(inv.student_id) ?? true;
        allPaidByStudent.set(inv.student_id, soFar && inv.status === "paid");
      }
      const paid = [...allPaidByStudent.values()].filter(Boolean).length;
      const rate = Math.round((paid / total) * 1000) / 10;

      return { grade: gl.name, rate, paid, total };
    }),
  );

  return {
    context,
    stats: {
      totalStudents,
      totalCollected,
      paidCount,
      paidRate,
      overdueCount,
      overdueAmount,
    },
    recentPayments,
    overdueStudents,
    gradeStats,
  };
}
