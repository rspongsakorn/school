import { createClient } from "@/lib/supabase/client";
import type { AcademicYearRow } from "@/lib/data/academic-years";

export type { AcademicYearRow };

export async function fetchAcademicYears(): Promise<AcademicYearRow[]> {
  const supabase = createClient();
  const { data: years, error } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_active")
    .order("start_date", { ascending: false });
  if (error || !years) return [];

  const yearIds = years.map((y) => y.id);
  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name, start_date, end_date")
    .in("academic_year_id", yearIds)
    .order("number", { ascending: true });

  return years.map((y) => ({
    ...y,
    semesters: (semesters ?? [])
      .filter((s) => s.academic_year_id === y.id)
      .map((s) => ({
        id: s.id,
        number: s.number,
        name: s.name,
        start_date: s.start_date,
        end_date: s.end_date,
      })),
  }));
}

export async function fetchAcademicYearById(id: string): Promise<AcademicYearRow | null> {
  const supabase = createClient();
  const { data: year, error } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error || !year) return null;

  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name, start_date, end_date")
    .eq("academic_year_id", id)
    .order("number", { ascending: true });

  return {
    ...year,
    semesters: (semesters ?? []).map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
    })),
  };
}
