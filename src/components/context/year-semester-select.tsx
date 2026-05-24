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
  selectedSemesterNumber: 1 | 2;
  basePath: string;
  clearGradeClassroomOnChange?: boolean;
};

function formatYearLabel(year: AcademicYearOption) {
  return `${year.name}${year.is_active ? " (ปัจจุบัน)" : ""}`;
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

  const semesterItems = useMemo(
    () => [
      { value: "1", label: "ภาค 1" },
      { value: "2", label: "ภาค 2" },
    ],
    [],
  );

  const selectedYearValue = years.some((y) => y.id === selectedYearId) ? selectedYearId : null;

  function navigate(yearId: string, semesterNumber: 1 | 2) {
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
    navigate(yearId, 1);
  }

  function handleSemesterChange(value: string | null) {
    if (!value) return;
    const semesterNumber = value === "2" ? 2 : 1;
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
      <Select
        value={String(selectedSemesterNumber)}
        onValueChange={handleSemesterChange}
        items={semesterItems}
      >
        <SelectTrigger className="h-9 w-[90px] border-border bg-background">
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
    </div>
  );
}
