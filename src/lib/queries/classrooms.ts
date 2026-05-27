import { createClient } from "@/lib/supabase/client";

export type GradeLevel = { id: string; name: string; sort_order: number };
export type Classroom = { id: string; name: string; grade_level_id: string };

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
    .select("id, name, grade_level_id")
    .eq("semester_id", semesterId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function fetchClassroomsByGrade(gradeLevelId: string): Promise<Classroom[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, grade_level_id")
    .eq("grade_level_id", gradeLevelId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data;
}
