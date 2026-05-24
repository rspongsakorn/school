import { formatStudentName } from "@/lib/format";
import { getStudentGradeMap } from "@/lib/data/enrollments";
import { buildStudentSearchOrFilter } from "@/lib/students/search";
import {
  STUDENT_STATUS_LABELS,
  STUDENTS_PAGE_SIZE,
  type StudentStatus,
} from "@/lib/students/constants";
import { createClient } from "@/lib/supabase/server";

export type StudentListRow = {
  id: string;
  studentCode: string;
  name: string;
  idCard: string | null;
  grade: string;
  status: string;
  statusRaw: StudentStatus;
  firstName: string;
  lastName: string;
};

export type StudentListParams = {
  q?: string;
  status?: StudentStatus | "all";
  page?: number;
  academicYearId?: string | null;
};

export type PaginatedStudents = {
  rows: StudentListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function mapStudentRow(
  s: {
    id: string;
    student_code: string;
    first_name: string;
    last_name: string;
    id_card: string | null;
    status: string;
  },
  gradeByStudent: Map<string, string>,
): StudentListRow {
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
  };
}

export async function listStudents(academicYearId: string | null): Promise<StudentListRow[]> {
  const supabase = await createClient();

  const { data: students, error } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name, id_card, status")
    .order("student_code", { ascending: true });

  if (error || !students) return [];

  const gradeByStudent = academicYearId
    ? await getStudentGradeMap(academicYearId)
    : new Map<string, string>();

  return students.map((s) => mapStudentRow(s, gradeByStudent));
}

export async function listStudentsPaginated(
  params: StudentListParams,
): Promise<PaginatedStudents> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = STUDENTS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  const q = params.q?.trim();
  const searchFilter = q ? buildStudentSearchOrFilter(q) : "";

  const gradePromise = params.academicYearId
    ? getStudentGradeMap(params.academicYearId)
    : Promise.resolve(new Map<string, string>());

  const studentsPromise = (async () => {
    let query = supabase
      .from("students")
      .select("id, student_code, first_name, last_name, id_card, status", { count: "exact" })
      .order("student_code", { ascending: true });

    if (searchFilter) {
      query = query.or(searchFilter);
    }

    if (params.status && params.status !== "all") {
      query = query.eq("status", params.status);
    }

    return query.range(from, to);
  })();

  const [{ data: students, count, error }, gradeByStudent] = await Promise.all([
    studentsPromise,
    gradePromise,
  ]);

  if (error || !students) {
    return { rows: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const rows = students.map((s) => mapStudentRow(s, gradeByStudent));
  const total = count ?? 0;

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
