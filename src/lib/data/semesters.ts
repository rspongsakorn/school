import type { SemesterOption } from "@/lib/context/semester-params";
import { createClient } from "@/lib/supabase/server";

export async function listSemestersForYears(yearIds: string[]): Promise<SemesterOption[]> {
  if (yearIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .in("academic_year_id", yearIds)
    .order("number", { ascending: true });

  if (error || !data) return [];

  return data.map((s) => ({
    id: s.id,
    academic_year_id: s.academic_year_id,
    number: s.number as 1 | 2,
    name: s.name,
  }));
}

export async function getSemesterById(id: string): Promise<SemesterOption | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    academic_year_id: data.academic_year_id,
    number: data.number as 1 | 2,
    name: data.name,
  };
}

export async function getSemesterByYearAndNumber(
  academicYearId: string,
  number: 1 | 2,
): Promise<SemesterOption | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .eq("academic_year_id", academicYearId)
    .eq("number", number)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    academic_year_id: data.academic_year_id,
    number: data.number as 1 | 2,
    name: data.name,
  };
}
