import { createClient } from "@/lib/supabase/client";
import type { AcademicYearOption } from "@/lib/data/academic-years";
import type { SemesterOption } from "@/lib/context/semester-params";

export async function fetchAcademicYearOptions(): Promise<AcademicYearOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, name, is_active")
    .order("start_date", { ascending: false });

  if (error || !data) return [];
  return data;
}

export async function fetchSemestersForYears(yearIds: string[]): Promise<SemesterOption[]> {
  if (yearIds.length === 0) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .in("academic_year_id", yearIds)
    .order("number", { ascending: true });

  if (error || !data) return [];

  return data.map((s) => ({
    id: s.id,
    academic_year_id: s.academic_year_id,
    number: s.number,
    name: s.name,
  }));
}
