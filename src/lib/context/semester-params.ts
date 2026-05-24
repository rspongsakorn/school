export type SemesterOption = {
  id: string;
  academic_year_id: string;
  number: 1 | 2;
  name: string | null;
};

export type SemesterContext = {
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  semesterNumber: 1 | 2;
};

export function parseSemesterNumber(value: string | undefined): 1 | 2 {
  if (value === "2") return 2;
  return 1;
}

export function resolveSemesterContext(
  yearParam: string | undefined,
  semesterParam: string | undefined,
  years: { id: string; name: string; is_active: boolean }[],
  semesters: SemesterOption[],
): SemesterContext | null {
  if (years.length === 0 || semesters.length === 0) return null;

  const academicYearId =
    yearParam && years.some((y) => y.id === yearParam)
      ? yearParam
      : (years.find((y) => y.is_active)?.id ?? years[0].id);

  const year = years.find((y) => y.id === academicYearId);
  if (!year) return null;

  const semesterNumber = parseSemesterNumber(semesterParam);
  const semester =
    semesters.find((s) => s.academic_year_id === academicYearId && s.number === semesterNumber) ??
    semesters.find((s) => s.academic_year_id === academicYearId && s.number === 1);

  if (!semester) return null;

  return {
    academicYearId,
    academicYearName: year.name,
    semesterId: semester.id,
    semesterNumber: semester.number,
  };
}
