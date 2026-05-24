import { formatClassroom } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type EnrollmentRow = {
  student_id: string;
  classrooms: { name: string; grade_levels: { name: string } | null } | null;
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

  for (const row of (data ?? []) as EnrollmentRow[]) {
    const classroom = row.classrooms;
    const gradeName = classroom?.grade_levels?.name ?? null;
    map.set(row.student_id, formatClassroom(gradeName, classroom?.name ?? null));
  }

  return map;
}
