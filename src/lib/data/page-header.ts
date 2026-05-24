import { getCurrentProfile, getYearSemesterContext } from "@/lib/data/context";

export async function getPageHeaderProps() {
  const [profile, context] = await Promise.all([
    getCurrentProfile(),
    getYearSemesterContext(),
  ]);

  return {
    displayName: profile?.display_name ?? "ผู้ใช้",
    yearName: context?.academicYearName,
    semesterNumber: context?.semesterNumber,
  };
}
