import { cookies } from "next/headers";
import { listAcademicYearOptions } from "@/lib/data/academic-years";
import { listSemestersForYears } from "@/lib/data/semesters";
import {
  SEMESTER_NUMBER_COOKIE,
  SEMESTER_YEAR_COOKIE,
} from "@/lib/context/semester-cookie";
import {
  parseSemesterNumber,
  resolveSemesterContext,
  type SemesterContext,
  type SemesterOption,
} from "@/lib/context/semester-params";
import type { AcademicYearOption } from "@/lib/data/academic-years";

export type SemesterPageContext = {
  years: AcademicYearOption[];
  semesters: SemesterOption[];
  ctx: SemesterContext | null;
};

async function readSemesterCookieParams(): Promise<{
  year?: string;
  semester?: string;
}> {
  const cookieStore = await cookies();
  const year = cookieStore.get(SEMESTER_YEAR_COOKIE)?.value;
  const semester = cookieStore.get(SEMESTER_NUMBER_COOKIE)?.value;
  return {
    year: year ? decodeURIComponent(year) : undefined,
    semester:
      semester && Number.parseInt(semester, 10) >= 1 ? semester : undefined,
  };
}

export async function loadSemesterPageContext(
  yearParam?: string,
  semesterParam?: string,
): Promise<SemesterPageContext> {
  const years = await listAcademicYearOptions();
  const semesters = await listSemestersForYears(years.map((y) => y.id));
  const cookie = await readSemesterCookieParams();

  const ctx = resolveSemesterContext(
    yearParam ?? cookie.year,
    semesterParam ?? cookie.semester,
    years,
    semesters,
  );

  return { years, semesters, ctx };
}

export function buildHeaderContextProps(
  page: SemesterPageContext,
  basePath: string,
  options?: { clearGradeClassroomOnChange?: boolean },
) {
  if (!page.ctx) return undefined;

  return {
    years: page.years,
    semesters: page.semesters,
    selectedYearId: page.ctx.academicYearId,
    selectedSemesterNumber: page.ctx.semesterNumber,
    yearName: page.ctx.academicYearName,
    semesterNumber: page.ctx.semesterNumber,
    basePath,
    clearGradeClassroomOnChange: options?.clearGradeClassroomOnChange ?? false,
  };
}

export function semesterParamFromNumber(number: number): string {
  return String(number);
}

export { parseSemesterNumber };
