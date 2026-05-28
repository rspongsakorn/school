import { createClient } from "@/lib/supabase/client";
import { formatStudentName } from "@/lib/format";
import { buildStudentSearchOrFilter } from "@/lib/students/search";
import {
  STUDENT_STATUS_LABELS,
  STUDENTS_PAGE_SIZE,
  type StudentGender,
  type StudentStatus,
} from "@/lib/students/constants";
import type { PaginatedStudents, StudentListRow, StudentListParams } from "@/lib/data/students";

export type { PaginatedStudents, StudentListRow, StudentListParams };

async function fetchStudentGradeMap(semesterId: string): Promise<Map<string, string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_enrollments")
    .select("student_id, classrooms(name, grade_levels(name))")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

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

async function fetchBlockedStudentIds(studentIds: string[]): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const supabase = createClient();
  // Block if currently enrolled (must unenroll first) or has an active payment
  // (must void receipt first). Invoices + voided payments are cascade-cleaned.
  const [activeEnrollments, activePayments] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("student_id")
      .in("student_id", studentIds)
      .eq("status", "enrolled"),
    supabase
      .from("payments")
      .select("student_id")
      .in("student_id", studentIds)
      .eq("status", "active"),
  ]);
  const blocked = new Set<string>();
  for (const r of activeEnrollments.data ?? []) blocked.add(r.student_id);
  for (const r of activePayments.data ?? []) blocked.add(r.student_id);
  return blocked;
}

export async function fetchStudentsPaginated(params: StudentListParams): Promise<PaginatedStudents> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = STUDENTS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = createClient();
  const q = params.q?.trim();
  const searchFilter = q ? buildStudentSearchOrFilter(q) : "";

  const gradePromise = params.semesterId
    ? fetchStudentGradeMap(params.semesterId)
    : Promise.resolve(new Map<string, string>());

  const studentsPromise = (async () => {
    let query = supabase
      .from("students")
      .select("id, student_code, first_name, last_name, id_card, gender, date_of_birth, status", {
        count: "exact",
      })
      .order("student_code", { ascending: true });
    if (searchFilter) query = query.or(searchFilter);
    if (params.status && params.status !== "all") query = query.eq("status", params.status);
    return query.range(from, to);
  })();

  const [{ data: students, count, error }, gradeByStudent] = await Promise.all([
    studentsPromise,
    gradePromise,
  ]);

  if (error || !students) return { rows: [], total: 0, page, pageSize, totalPages: 0 };

  const studentIds = students.map((s) => s.id);
  const blockedStudentIds = await fetchBlockedStudentIds(studentIds);

  const rows: StudentListRow[] = students.map((s) => {
    const statusRaw = s.status as StudentStatus;
    return {
      id: s.id,
      studentCode: s.student_code,
      name: formatStudentName(s.first_name, s.last_name),
      idCard: s.id_card,
      grade: gradeByStudent.get(s.id) ?? "—",
      status: STUDENT_STATUS_LABELS[statusRaw] ?? s.status,
      statusRaw,
      firstName: s.first_name,
      lastName: s.last_name,
      gender: (s.gender as StudentGender | null) ?? null,
      dateOfBirth: s.date_of_birth ?? null,
      deletable: !blockedStudentIds.has(s.id),
    };
  });

  const total = count ?? 0;
  return { rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
