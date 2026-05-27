"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { fetchAcademicYearOptions, fetchSemestersForYears } from "@/lib/queries/context";
import { readSemesterCookieFromDocument } from "@/lib/context/semester-cookie";
import { resolveSemesterContext } from "@/lib/context/semester-params";
import type { AcademicYearOption } from "@/lib/data/academic-years";
import type { SemesterOption, SemesterContext } from "@/lib/context/semester-params";

export type SemesterContextResult = {
  years: AcademicYearOption[];
  semesters: SemesterOption[];
  ctx: SemesterContext | null;
  isLoading: boolean;
};

export function useSemesterContext(): SemesterContextResult {
  const searchParams = useSearchParams();
  const yearParam = searchParams.get("year") ?? undefined;
  const semesterParam = searchParams.get("semester") ?? undefined;

  const yearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: fetchAcademicYearOptions,
    staleTime: 60_000,
  });

  const years = yearsQuery.data ?? [];
  const yearIds = years.map((y) => y.id);

  const semestersQuery = useQuery({
    queryKey: ["semesters", yearIds],
    queryFn: () => fetchSemestersForYears(yearIds),
    enabled: yearIds.length > 0,
    staleTime: 60_000,
  });

  const semesters = semestersQuery.data ?? [];

  const cookie = readSemesterCookieFromDocument();
  const resolvedYear = yearParam ?? cookie.yearId ?? undefined;
  const resolvedSemester =
    semesterParam ?? (cookie.semesterNumber ? String(cookie.semesterNumber) : undefined);

  const ctx = resolveSemesterContext(resolvedYear, resolvedSemester, years, semesters);

  return {
    years,
    semesters,
    ctx,
    isLoading: yearsQuery.isLoading || (yearIds.length > 0 && semestersQuery.isLoading),
  };
}
