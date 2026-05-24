import { formatClassroom, formatStudentName } from "@/lib/format";
import { getStudentGradeMap } from "@/lib/data/enrollments";
import { createClient } from "@/lib/supabase/server";

export type StudentListRow = {
  id: string;
  studentCode: string;
  name: string;
  grade: string;
  status: string;
};

const statusLabels: Record<string, string> = {
  active: "กำลังศึกษา",
  graduated: "จบการศึกษา",
  transferred: "ย้ายออก",
  withdrawn: "ลาออก",
};

export async function listStudents(academicYearId: string | null): Promise<StudentListRow[]> {
  const supabase = await createClient();

  const { data: students, error } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name, status")
    .order("student_code", { ascending: true });

  if (error || !students) return [];

  const gradeByStudent = academicYearId
    ? await getStudentGradeMap(academicYearId)
    : new Map<string, string>();

  return students.map((s) => ({
    id: s.id,
    studentCode: s.student_code,
    name: formatStudentName(s.first_name, s.last_name),
    grade: gradeByStudent.get(s.id) ?? "—",
    status: statusLabels[s.status] ?? s.status,
  }));
}
