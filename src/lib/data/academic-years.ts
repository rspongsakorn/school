import { createClient } from "@/lib/supabase/server";

export type SemesterRow = {
  id: string;
  number: number;
  name: string | null;
  start_date: string;
  end_date: string;
};

export type AcademicYearOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export async function listAcademicYearOptions(): Promise<AcademicYearOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, name, is_active")
    .order("start_date", { ascending: false });

  if (error || !data) return [];
  return data;
}

export type AcademicYearRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  semesters: SemesterRow[];
};

export async function listAcademicYears(): Promise<AcademicYearRow[]> {
  const supabase = await createClient();

  const { data: years, error } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_active")
    .order("start_date", { ascending: false });

  if (error || !years) return [];

  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name, start_date, end_date")
    .in(
      "academic_year_id",
      years.map((y) => y.id),
    )
    .order("number", { ascending: true });

  const semestersByYear = new Map<string, SemesterRow[]>();
  for (const sem of semesters ?? []) {
    const list = semestersByYear.get(sem.academic_year_id) ?? [];
    list.push({
      id: sem.id,
      number: sem.number,
      name: sem.name,
      start_date: sem.start_date,
      end_date: sem.end_date,
    });
    semestersByYear.set(sem.academic_year_id, list);
  }

  return years.map((y) => ({
    ...y,
    semesters: semestersByYear.get(y.id) ?? [],
  }));
}

export async function getAcademicYearById(id: string): Promise<AcademicYearRow | null> {
  const supabase = await createClient();

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
    semesters: (semesters ?? []).map((sem) => ({
      id: sem.id,
      number: sem.number,
      name: sem.name,
      start_date: sem.start_date,
      end_date: sem.end_date,
    })),
  };
}
