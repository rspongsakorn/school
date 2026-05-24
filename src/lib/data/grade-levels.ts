import { createClient } from "@/lib/supabase/server";

export type GradeLevelRow = {
  id: string;
  name: string;
  sort_order: number;
  academic_year_id: string;
  semester_id: string;
};

export async function listGradeLevels(semesterId: string): Promise<GradeLevelRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grade_levels")
    .select("id, name, sort_order, academic_year_id, semester_id")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data;
}
