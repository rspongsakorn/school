import { getSessionProfile } from "@/lib/auth/session-profile";
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
  const profile = await getSessionProfile();
  if (!profile) return null;
  return {
    display_name: profile.display_name,
    role: profile.role,
    is_active: profile.is_active,
    email: profile.email,
  };
}
