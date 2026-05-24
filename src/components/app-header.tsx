"use client";

import { UserMenu } from "@/components/auth/user-menu";
import { YearSemesterSelect } from "@/components/context/year-semester-select";
import type { AcademicYearOption } from "@/lib/data/academic-years";
import type { SemesterOption } from "@/lib/context/semester-params";

type AppHeaderProps = {
  title: string;
  displayName: string;
  yearName?: string;
  semesterNumber?: number;
  showContextSelectors?: boolean;
  context?: {
    years: AcademicYearOption[];
    semesters: SemesterOption[];
    selectedYearId: string;
    selectedSemesterNumber: 1 | 2;
    basePath: string;
    clearGradeClassroomOnChange?: boolean;
  };
};

export function AppHeader({
  title,
  displayName,
  yearName,
  semesterNumber,
  showContextSelectors = true,
  context,
}: AppHeaderProps) {
  const subtitleYear = context?.years.find((y) => y.id === context.selectedYearId)?.name ?? yearName;
  const subtitleSemester = context?.selectedSemesterNumber ?? semesterNumber ?? 1;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {subtitleYear ? (
          <p className="text-xs text-muted-foreground">
            ภาคเรียนที่ {subtitleSemester} · ปี {subtitleYear}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        {showContextSelectors && context ? (
          <YearSemesterSelect
            years={context.years}
            semesters={context.semesters}
            selectedYearId={context.selectedYearId}
            selectedSemesterNumber={context.selectedSemesterNumber}
            basePath={context.basePath}
            clearGradeClassroomOnChange={context.clearGradeClassroomOnChange}
          />
        ) : null}
        <UserMenu displayName={displayName} />
      </div>
    </header>
  );
}
