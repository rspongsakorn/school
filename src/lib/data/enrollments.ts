import { formatClassroom, formatStudentName } from "@/lib/format";
import type { EnrollmentStatus } from "@/lib/enrollment/constants";
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
};

export type StudentEnrollmentCandidate = {
  studentId: string;
  studentCode: string;
  name: string;
};

export async function getStudentGradeMap(academicYearId: string) {
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
    .eq("academic_year_id", academicYearId)
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

  return (data as unknown as Row[])
    .filter((row) => row.students)
    .map((row) => ({
      enrollmentId: row.id,
      studentId: row.students!.id,
      studentCode: row.students!.student_code,
      firstName: row.students!.first_name,
      lastName: row.students!.last_name,
      name: formatStudentName(row.students!.first_name, row.students!.last_name),
      status: row.status as EnrollmentStatus,
    }));
}

export async function listStudentsAvailableForEnrollment(
  academicYearId: string,
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
    .eq("academic_year_id", academicYearId);

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
