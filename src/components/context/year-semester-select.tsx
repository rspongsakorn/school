"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AcademicYearOption } from "@/lib/data/academic-years";
import { setSemesterCookie } from "@/lib/context/semester-cookie";
import type { SemesterOption } from "@/lib/context/semester-params";

type YearSemesterSelectProps = {
  years: AcademicYearOption[];
  semesters: SemesterOption[];
  selectedYearId: string;
  selectedSemesterNumber: number;
  basePath: string;
  clearGradeClassroomOnChange?: boolean;
};

function formatYearLabel(year: AcademicYearOption) {
  return `${year.name}${year.is_active ? " (ปัจจุบัน)" : ""}`;
}

function formatSemesterLabel(semester: SemesterOption) {
  return semester.name ? `ภาค ${semester.number} (${semester.name})` : `ภาค ${semester.number}`;
}

export function YearSemesterSelect({
  years,
  semesters,
  selectedYearId,
  selectedSemesterNumber,
  basePath,
  clearGradeClassroomOnChange = false,
}: YearSemesterSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const yearItems = useMemo(
    () =>
      years.map((year) => ({
        value: year.id,
        label: formatYearLabel(year),
      })),
    [years],
  );

  const semestersInYear = useMemo(
    () =>
      semesters
        .filter((s) => s.academic_year_id === selectedYearId)
        .sort((a, b) => a.number - b.number),
    [semesters, selectedYearId],
  );

  const semesterItems = useMemo(
    () =>
      semestersInYear.map((s) => ({
        value: String(s.number),
        label: formatSemesterLabel(s),
      })),
    [semestersInYear],
  );

  const selectedYearValue = years.some((y) => y.id === selectedYearId) ? selectedYearId : null;
  const selectedSemesterValue = semestersInYear.some((s) => s.number === selectedSemesterNumber)
    ? String(selectedSemesterNumber)
    : semesterItems[0]?.value ?? null;

  function navigate(yearId: string, semesterNumber: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", yearId);
    params.set("semester", String(semesterNumber));

    if (clearGradeClassroomOnChange) {
      params.delete("grade");
      params.delete("classroom");
    }

    setSemesterCookie(yearId, semesterNumber);
    router.push(`${basePath}?${params.toString()}`);
  }

  function handleYearChange(yearId: string | null) {
    if (!yearId) return;
    const firstSemester = semesters
      .filter((s) => s.academic_year_id === yearId)
      .sort((a, b) => a.number - b.number)[0];
    navigate(yearId, firstSemester?.number ?? 1);
  }

  function handleSemesterChange(value: string | null) {
    if (!value) return;
    const semesterNumber = Number.parseInt(value, 10);
    if (!Number.isFinite(semesterNumber)) return;
    navigate(selectedYearId, semesterNumber);
  }

  if (years.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedYearValue} onValueChange={handleYearChange} items={yearItems}>
        <SelectTrigger className="h-9 w-[120px] border-border bg-background">
          <SelectValue placeholder="ปี" />
        </SelectTrigger>
        <SelectContent>
          {yearItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {semesterItems.length > 0 ? (
        <Select
          value={selectedSemesterValue}
          onValueChange={handleSemesterChange}
          items={semesterItems}
        >
          <SelectTrigger className="h-9 min-w-[90px] border-border bg-background">
            <SelectValue placeholder="ภาค" />
          </SelectTrigger>
          <SelectContent>
            {semesterItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
