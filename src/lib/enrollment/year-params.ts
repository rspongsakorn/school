export type AcademicYearOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export function resolveSelectedYearId(
  yearParam: string | undefined,
  years: AcademicYearOption[],
): string | null {
  if (years.length === 0) return null;
  if (yearParam && years.some((y) => y.id === yearParam)) return yearParam;
  return years.find((y) => y.is_active)?.id ?? years[0].id;
}
