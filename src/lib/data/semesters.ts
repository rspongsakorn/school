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
    number: s.number,
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
    number: data.number,
    name: data.name,
  };
}

export async function getSemesterByYearAndNumber(
  academicYearId: string,
  number: number,
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
    number: data.number,
    name: data.name,
  };
}

export async function listSemestersWithGradeLevels(
  academicYearId: string,
): Promise<SemesterOption[]> {
  const supabase = await createClient();
  const { data: semesters, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .eq("academic_year_id", academicYearId)
    .order("number", { ascending: true });

  if (error || !semesters) return [];

  const withGrades: SemesterOption[] = [];
  for (const semester of semesters) {
    const { count } = await supabase
      .from("grade_levels")
      .select("id", { count: "exact", head: true })
      .eq("semester_id", semester.id);

    if ((count ?? 0) > 0) {
      withGrades.push({
        id: semester.id,
        academic_year_id: semester.academic_year_id,
        number: semester.number,
        name: semester.name,
      });
    }
  }

  return withGrades;
}
