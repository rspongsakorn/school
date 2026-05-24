import { createClient } from "@/lib/supabase/server";

export type ClassroomRow = {
  id: string;
  name: string;
  grade_level_id: string;
  academic_year_id: string;
  enrolled_count: number;
};

export type ClassroomWithGradeRow = ClassroomRow & {
  grade_name: string;
  grade_sort_order: number;
};

export async function listClassroomsByGrade(gradeLevelId: string): Promise<ClassroomRow[]> {
  const supabase = await createClient();
  const { data: classrooms, error } = await supabase
    .from("classrooms")
    .select("id, name, grade_level_id, academic_year_id")
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

export async function listClassroomsByYear(
  academicYearId: string,
): Promise<ClassroomWithGradeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .select(
      `
      id,
      name,
      grade_level_id,
      academic_year_id,
      grade_levels ( name, sort_order )
    `,
    )
    .eq("academic_year_id", academicYearId)
    .order("name", { ascending: true });

  if (error || !data) return [];

  type Row = {
    id: string;
    name: string;
    grade_level_id: string;
    academic_year_id: string;
    grade_levels: { name: string; sort_order: number } | null;
  };

  const rows = data as unknown as Row[];

  return rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      grade_level_id: c.grade_level_id,
      academic_year_id: c.academic_year_id,
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
