import { createClient } from "@/lib/supabase/client";
import { formatClassroom, formatStudentName } from "@/lib/format";

export type OutstandingReportRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  subtotal: number;
  discountLabel: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
};

export type CollectionsReportRow = {
  gradeName: string;
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  ratePercent: number;
};

function discountLabel(
  discountType: "percent" | "fixed" | null,
  discountValue: number | null,
): string {
  if (!discountType || discountValue == null) return "—";
  if (discountType === "percent") return `${discountValue}%`;
  return `฿${discountValue.toLocaleString("th-TH")}`;
}

/** Inline browser-client version of getStudentGradeMap (avoids server-only import) */
async function getStudentGradeMap(semesterId: string): Promise<Map<string, string>> {
  const supabase = createClient();

  type EnrollmentRow = {
    student_id: string;
    classrooms: { name: string; grade_levels: { name: string } | null } | null;
  };

  const { data } = await supabase
    .from("student_enrollments")
    .select(
      `
      student_id,
      classrooms (
        name,
        grade_levels ( name )
      )
    `,
    )
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

  const map = new Map<string, string>();

  for (const row of (data ?? []) as unknown as EnrollmentRow[]) {
    const classroom = row.classrooms;
    const gradeName = classroom?.grade_levels?.name ?? null;
    map.set(row.student_id, formatClassroom(gradeName, classroom?.name ?? null));
  }

  return map;
}

export async function fetchOutstandingReport(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  teacherProfileId?: string;
}): Promise<OutstandingReportRow[]> {
  const supabase = createClient();
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
      discount_type,
      discount_value,
      total_amount,
      paid_amount,
      status,
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

  if (allowedStudentIds) {
    query = query.in("student_id", allowedStudentIds);
  }

  const { data } = await query;

  type Row = {
    student_id: string;
    subtotal: number;
    discount_type: "percent" | "fixed" | null;
    discount_value: number | null;
    total_amount: number;
    paid_amount: number;
    status: "unpaid" | "partial" | "paid";
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
      discountLabel: discountLabel(row.discount_type, row.discount_value),
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      status: row.status,
    };
  });
}

export async function fetchCollectionsByGrade(
  semesterId: string,
  academicYearId: string,
  teacherProfileId?: string,
): Promise<CollectionsReportRow[]> {
  const supabase = createClient();

  const { data: grades } = await supabase
    .from("grade_levels")
    .select("id, name, sort_order")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: true });

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
