import { createClient } from "@/lib/supabase/client";

export type GradeLevel = { id: string; name: string; sort_order: number };
export type Classroom = { id: string; name: string; grade_level_id: string; gradeSortOrder: number };

export async function fetchGradeLevels(semesterId: string): Promise<GradeLevel[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("grade_levels")
    .select("id, name, sort_order")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function fetchClassroomsBySemester(semesterId: string): Promise<Classroom[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, grade_level_id, grade_levels ( sort_order )")
    .eq("semester_id", semesterId);
  if (error || !data) return [];

  type Row = {
    id: string;
    name: string;
    grade_level_id: string;
    grade_levels: { sort_order: number } | null;
  };

  return (data as unknown as Row[])
    .map((row) => ({
      id: row.id,
      name: row.name,
      grade_level_id: row.grade_level_id,
      gradeSortOrder: row.grade_levels?.sort_order ?? 0,
    }))
    .sort((a, b) => {
      const diff = a.gradeSortOrder - b.gradeSortOrder;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "th", { numeric: true });
    });
}

export async function fetchClassroomsByGrade(gradeLevelId: string): Promise<Classroom[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, grade_level_id")
    .eq("grade_level_id", gradeLevelId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return (data as { id: string; name: string; grade_level_id: string }[]).map((row) => ({
    ...row,
    gradeSortOrder: 0,
  }));
}
