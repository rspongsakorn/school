import { createClient } from "@/lib/supabase/server";

export type GradeLevelRow = {
  id: string;
  name: string;
  sort_order: number;
  academic_year_id: string;
};

export async function listGradeLevels(academicYearId: string): Promise<GradeLevelRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grade_levels")
    .select("id, name, sort_order, academic_year_id")
    .eq("academic_year_id", academicYearId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data;
}
