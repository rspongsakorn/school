import { formatStudentName } from "@/lib/format";
import { getStudentGradeMap } from "@/lib/data/enrollments";
import { createClient } from "@/lib/supabase/server";

export type OutstandingReportRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
  isReimbursable: boolean;
};

export type CollectionsReportRow = {
  gradeName: string;
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  ratePercent: number;
};

export async function listOutstandingReport(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  variant?: "standard" | "reimbursable" | "all";
  teacherProfileId?: string;
}): Promise<OutstandingReportRow[]> {
  const supabase = await createClient();
  const gradeByStudent = await getStudentGradeMap(params.semesterId);

  let allowedStudentIds: string[] | null = null;

  if (params.teacherProfileId) {
    const { data: assignments } = await supabase
      .from("teacher_assignments")
      .select("classroom_id")
      .eq("profile_id", params.teacherProfileId)
      .eq("semester_id", params.semesterId);

    const classroomIds = (assignments ?? []).map((a) => a.classroom_id);
    if (classroomIds.length === 0) return [];

    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("semester_id", params.semesterId)
      .in("classroom_id", classroomIds);

    allowedStudentIds = (enrollments ?? []).map((e) => e.student_id);
    if (allowedStudentIds.length === 0) return [];
  }

  if (params.gradeLevelId || params.classroomId) {
    let enrollmentQuery = supabase
      .from("student_enrollments")
      .select("student_id, classrooms!inner(grade_level_id)")
      .eq("semester_id", params.semesterId)
      .eq("status", "enrolled");

    if (params.classroomId) {
      enrollmentQuery = enrollmentQuery.eq("classroom_id", params.classroomId);
    } else if (params.gradeLevelId) {
      enrollmentQuery = enrollmentQuery.eq("classrooms.grade_level_id", params.gradeLevelId);
    }

    const { data: filtered } = await enrollmentQuery;
    const ids = (filtered ?? []).map((e) => e.student_id);

    allowedStudentIds = allowedStudentIds
      ? allowedStudentIds.filter((id) => ids.includes(id))
      : ids;

    if (allowedStudentIds.length === 0) return [];
  }

  let query = supabase
    .from("student_invoices")
    .select(
      `
      student_id,
      subtotal,
      total_amount,
      paid_amount,
      status,
      is_reimbursable,
      students!inner ( student_code, first_name, last_name )
    `,
    )
    .eq("academic_year_id", params.academicYearId)
    .eq("semester_id", params.semesterId)
    .order("student_code", { ascending: true, foreignTable: "students" });

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  } else {
    query = query.in("status", ["unpaid", "partial"]);
  }

  if (params.variant === "reimbursable") {
    query = query.eq("is_reimbursable", true);
  } else if (params.variant === "standard") {
    query = query.eq("is_reimbursable", false);
  }

  if (allowedStudentIds) {
    query = query.in("student_id", allowedStudentIds);
  }

  const { data } = await query;

  type Row = {
    student_id: string;
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    status: "unpaid" | "partial" | "paid";
    is_reimbursable: boolean;
    students: { student_code: string; first_name: string; last_name: string };
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const totalAmount = Number(row.total_amount);
    const paidAmount = Number(row.paid_amount);
    const subtotal = Number(row.subtotal);
    return {
      studentId: row.student_id,
      studentCode: row.students.student_code,
      studentName: formatStudentName(row.students.first_name, row.students.last_name),
      gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
      subtotal,
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      isReimbursable: row.is_reimbursable,
      status: row.status,
    };
  });
}

export async function listCollectionsByGrade(
  semesterId: string,
  academicYearId: string,
  teacherProfileId?: string,
): Promise<CollectionsReportRow[]> {
  const supabase = await createClient();

  let gradeQuery = supabase
    .from("grade_levels")
    .select("id, name, sort_order")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: true });

  const { data: grades } = await gradeQuery;
  if (!grades || grades.length === 0) return [];

  const results: CollectionsReportRow[] = [];

  for (const grade of grades) {
    const { data: classrooms } = await supabase
      .from("classrooms")
      .select("id")
      .eq("grade_level_id", grade.id)
      .eq("semester_id", semesterId);

    let classroomIds = (classrooms ?? []).map((c) => c.id);

    if (teacherProfileId) {
      const { data: assignments } = await supabase
        .from("teacher_assignments")
        .select("classroom_id")
        .eq("profile_id", teacherProfileId)
        .eq("semester_id", semesterId)
        .in("classroom_id", classroomIds);

      classroomIds = (assignments ?? []).map((a) => a.classroom_id);
    }

    if (classroomIds.length === 0) {
      results.push({
        gradeName: grade.name,
        studentCount: 0,
        totalDue: 0,
        totalPaid: 0,
        ratePercent: 0,
      });
      continue;
    }

    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("semester_id", semesterId)
      .eq("status", "enrolled")
      .in("classroom_id", classroomIds);

    const studentIds = (enrollments ?? []).map((e) => e.student_id);
    if (studentIds.length === 0) {
      results.push({
        gradeName: grade.name,
        studentCount: 0,
        totalDue: 0,
        totalPaid: 0,
        ratePercent: 0,
      });
      continue;
    }

    const { data: invoices } = await supabase
      .from("student_invoices")
      .select("total_amount, paid_amount")
      .eq("academic_year_id", academicYearId)
      .eq("semester_id", semesterId)
      .in("student_id", studentIds);

    const totalDue = (invoices ?? []).reduce((sum, i) => sum + Number(i.total_amount), 0);
    const totalPaid = (invoices ?? []).reduce((sum, i) => sum + Number(i.paid_amount), 0);
    const ratePercent = totalDue > 0 ? round2((totalPaid / totalDue) * 100) : 0;

    results.push({
      gradeName: grade.name,
      studentCount: studentIds.length,
      totalDue: round2(totalDue),
      totalPaid: round2(totalPaid),
      ratePercent,
    });
  }

  return results;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
