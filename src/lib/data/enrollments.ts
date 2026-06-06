import { formatClassroom, formatStudentName } from "@/lib/format";
import type { EnrollmentStatus } from "@/lib/enrollment/constants";
import { canDeleteEnrollment } from "@/lib/enrollment/enrollment-delete-eligibility";
import { buildStudentSearchOrFilter } from "@/lib/students/search";
import { createClient } from "@/lib/supabase/server";

type EnrollmentRow = {
  student_id: string;
  classrooms: { name: string; grade_levels: { name: string } | null } | null;
};

export type EnrollmentRosterRow = {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  name: string;
  status: EnrollmentStatus;
  deletable: boolean;
};

export type StudentEnrollmentCandidate = {
  studentId: string;
  studentCode: string;
  name: string;
};

type GradeSortRow = {
  student_id: string;
  classrooms: { grade_levels: { sort_order: number } | null } | null;
};

export async function getStudentGradeSortMap(semesterId: string): Promise<Map<string, number>> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("student_enrollments")
    .select("student_id, classrooms ( grade_levels ( sort_order ) )")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

  const map = new Map<string, number>();
  for (const row of (data ?? []) as unknown as GradeSortRow[]) {
    map.set(row.student_id, row.classrooms?.grade_levels?.sort_order ?? 0);
  }
  return map;
}

export async function getStudentGradeMap(semesterId: string) {
  const supabase = await createClient();

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

export async function listClassroomRoster(classroomId: string): Promise<EnrollmentRosterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_enrollments")
    .select(
      `
      id,
      status,
      students (
        id,
        student_code,
        first_name,
        last_name
      )
    `,
    )
    .eq("classroom_id", classroomId)
    .eq("status", "enrolled")
    .order("student_code", { ascending: true, foreignTable: "students" });

  if (error || !data) return [];

  type Row = {
    id: string;
    status: string;
    students: {
      id: string;
      student_code: string;
      first_name: string;
      last_name: string;
    } | null;
  };

  const rosterRows = (data as unknown as Row[]).filter((row) => row.students);

  const { data: classroom } = await supabase
    .from("classrooms")
    .select("semester_id")
    .eq("id", classroomId)
    .maybeSingle();

  const semesterId = classroom?.semester_id;
  const studentIds = rosterRows.map((row) => row.students!.id);
  const studentsWithInvoice = semesterId
    ? await loadStudentIdsWithInvoiceInSemester(studentIds, semesterId)
    : new Set<string>();

  return rosterRows.map((row) => {
    const status = row.status as EnrollmentStatus;
    const studentId = row.students!.id;
    return {
      enrollmentId: row.id,
      studentId,
      studentCode: row.students!.student_code,
      firstName: row.students!.first_name,
      lastName: row.students!.last_name,
      name: formatStudentName(row.students!.first_name, row.students!.last_name),
      status,
      deletable: canDeleteEnrollment({
        status,
        hasInvoiceInSemester: studentsWithInvoice.has(studentId),
      }),
    };
  });
}

async function loadStudentIdsWithInvoiceInSemester(
  studentIds: string[],
  semesterId: string,
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_invoices")
    .select("student_id")
    .eq("semester_id", semesterId)
    .in("student_id", studentIds);

  return new Set((data ?? []).map((row) => row.student_id));
}

export async function listStudentsAvailableForEnrollment(
  semesterId: string,
  query?: string,
): Promise<StudentEnrollmentCandidate[]> {
  const supabase = await createClient();

  let studentQuery = supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .eq("status", "active")
    .order("student_code", { ascending: true })
    .limit(50);

  const q = query?.trim();
  const searchFilter = q ? buildStudentSearchOrFilter(q) : "";
  if (searchFilter) {
    studentQuery = studentQuery.or(searchFilter);
  }

  const { data: students, error } = await studentQuery;
  if (error || !students) return [];

  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_id, status")
    .eq("semester_id", semesterId);

  const enrolledStudentIds = new Set(
    (enrollments ?? []).filter((e) => e.status === "enrolled").map((e) => e.student_id),
  );

  return students
    .filter((s) => !enrolledStudentIds.has(s.id))
    .map((s) => ({
      studentId: s.id,
      studentCode: s.student_code,
      name: formatStudentName(s.first_name, s.last_name),
    }));
}
