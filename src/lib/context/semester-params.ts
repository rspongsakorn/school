export type SemesterOption = {
  id: string;
  academic_year_id: string;
  number: number;
  name: string | null;
};

export type SemesterContext = {
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  semesterNumber: number;
};

export function parseSemesterNumber(
  value: string | undefined,
  availableInYear: number[],
): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1 && availableInYear.includes(parsed)) {
    return parsed;
  }
  if (availableInYear.length > 0) {
    return Math.min(...availableInYear);
  }
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

  const availableNumbers = semesters
    .filter((s) => s.academic_year_id === academicYearId)
    .map((s) => s.number)
    .sort((a, b) => a - b);

  if (availableNumbers.length === 0) return null;

  const semesterNumber = parseSemesterNumber(semesterParam, availableNumbers);
  const semester = semesters.find(
    (s) => s.academic_year_id === academicYearId && s.number === semesterNumber,
  );

  if (!semester) return null;

  return {
    academicYearId,
    academicYearName: year.name,
    semesterId: semester.id,
    semesterNumber: semester.number,
  };
}
