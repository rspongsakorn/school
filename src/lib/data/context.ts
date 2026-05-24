import { createClient } from "@/lib/supabase/server";

export type YearSemesterContext = {
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  semesterNumber: number;
};

export async function getYearSemesterContext(): Promise<YearSemesterContext | null> {
  const supabase = await createClient();

  const { data: year } = await supabase
    .from("academic_years")
    .select("id, name")
    .eq("is_active", true)
    .maybeSingle();

  if (!year) {
    const { data: fallbackYear } = await supabase
      .from("academic_years")
      .select("id, name")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!fallbackYear) return null;

    const { data: semester } = await supabase
      .from("semesters")
      .select("id, number")
      .eq("academic_year_id", fallbackYear.id)
      .order("number", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!semester) return null;

    return {
      academicYearId: fallbackYear.id,
      academicYearName: fallbackYear.name,
      semesterId: semester.id,
      semesterNumber: semester.number,
    };
  }

  const { data: semester } = await supabase
    .from("semesters")
    .select("id, number")
    .eq("academic_year_id", year.id)
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!semester) return null;

  return {
    academicYearId: year.id,
    academicYearName: year.name,
    semesterId: semester.id,
    semesterNumber: semester.number,
  };
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  return profile
    ? { ...profile, email: user.email ?? "" }
    : { display_name: user.email ?? "ผู้ใช้", role: "teacher" as const, is_active: false, email: user.email ?? "" };
}
