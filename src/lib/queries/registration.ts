import { createClient } from "@/lib/supabase/client";
import { formatStudentName } from "@/lib/format";
import type { EnrollmentStatus } from "@/lib/enrollment/constants";
import { canDeleteEnrollment } from "@/lib/enrollment/enrollment-delete-eligibility";
import type { SemesterOption } from "@/lib/context/semester-params";

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

export type ClassroomRow = {
  id: string;
  name: string;
  grade_level_id: string;
  academic_year_id: string;
  semester_id: string;
  enrolled_count: number;
};

export type ClassroomWithGradeRow = ClassroomRow & {
  grade_name: string;
  grade_sort_order: number;
};

export async function fetchClassroomRoster(classroomId: string): Promise<EnrollmentRosterRow[]> {
  const supabase = createClient();
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
    ? await loadStudentIdsWithInvoiceInSemester(supabase, studentIds, semesterId)
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
  supabase: ReturnType<typeof createClient>,
  studentIds: string[],
  semesterId: string,
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();

  const { data } = await supabase
    .from("student_invoices")
    .select("student_id")
    .eq("semester_id", semesterId)
    .in("student_id", studentIds);

  return new Set((data ?? []).map((row) => row.student_id));
}

export async function fetchEnrollmentCandidates(
  semesterId: string,
): Promise<StudentEnrollmentCandidate[]> {
  const supabase = createClient();

  const { data: students, error } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .eq("status", "active")
    .order("student_code", { ascending: true })
    .limit(50);

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

export async function fetchSemestersWithGradeLevels(
  academicYearId: string,
): Promise<SemesterOption[]> {
  const supabase = createClient();
  const { data: semesters, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .eq("academic_year_id", academicYearId)
    .order("number", { ascending: true });

  if (error || !semesters) return [];

  const withGrades: SemesterOption[] = [];
  for (const semester of semesters) {
    const { count } = await supabase
      .from("grade_levels")
      .select("id", { count: "exact", head: true })
      .eq("semester_id", semester.id);

    if ((count ?? 0) > 0) {
      withGrades.push({
        id: semester.id,
        academic_year_id: semester.academic_year_id,
        number: semester.number,
        name: semester.name,
      });
    }
  }

  return withGrades;
}

export async function fetchClassroomsByGradeWithCount(
  gradeLevelId: string,
): Promise<ClassroomRow[]> {
  const supabase = createClient();
  const { data: classrooms, error } = await supabase
    .from("classrooms")
    .select("id, name, grade_level_id, academic_year_id, semester_id")
    .eq("grade_level_id", gradeLevelId)
    .order("name", { ascending: true });

  if (error || !classrooms) return [];

  const classroomIds = classrooms.map((c) => c.id);
  if (classroomIds.length === 0) return [];

  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("classroom_id")
    .in("classroom_id", classroomIds)
    .eq("status", "enrolled");

  const countByClassroom = new Map<string, number>();
  for (const row of enrollments ?? []) {
    countByClassroom.set(row.classroom_id, (countByClassroom.get(row.classroom_id) ?? 0) + 1);
  }

  return classrooms.map((c) => ({
    ...c,
    enrolled_count: countByClassroom.get(c.id) ?? 0,
  }));
}

export async function fetchClassroomsBySemesterWithGrade(
  semesterId: string,
): Promise<ClassroomWithGradeRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .select(
      `
      id,
      name,
      grade_level_id,
      academic_year_id,
      semester_id,
      grade_levels ( name, sort_order )
    `,
    )
    .eq("semester_id", semesterId)
    .order("name", { ascending: true });

  if (error || !data) return [];

  type Row = {
    id: string;
    name: string;
    grade_level_id: string;
    academic_year_id: string;
    semester_id: string;
    grade_levels: { name: string; sort_order: number } | null;
  };

  const rows = data as unknown as Row[];

  return rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      grade_level_id: c.grade_level_id,
      academic_year_id: c.academic_year_id,
      semester_id: c.semester_id,
      enrolled_count: 0,
      grade_name: c.grade_levels?.name ?? "—",
      grade_sort_order: c.grade_levels?.sort_order ?? 0,
    }))
    .sort((a, b) => {
      if (a.grade_sort_order !== b.grade_sort_order) {
        return a.grade_sort_order - b.grade_sort_order;
      }
      return a.name.localeCompare(b.name, "th");
    });
}
