"use client";

import { useSemesterContext } from "@/hooks/use-semester-context";
import { UserMenu } from "@/components/auth/user-menu";
import { YearSemesterSelect } from "@/components/context/year-semester-select";

type AppHeaderProps = {
  title: string;
  basePath?: string;
  clearGradeClassroomOnChange?: boolean;
};

export function AppHeader({ title, basePath, clearGradeClassroomOnChange = false }: AppHeaderProps) {
  const { years, semesters, ctx } = useSemesterContext();

  const showSelectors = Boolean(basePath && ctx);
  const subtitleYear = ctx?.academicYearName;
  const subtitleSemester = ctx?.semesterNumber ?? 1;

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
        {showSelectors && ctx && basePath ? (
          <YearSemesterSelect
            years={years}
            semesters={semesters}
            selectedYearId={ctx.academicYearId}
            selectedSemesterNumber={ctx.semesterNumber}
            basePath={basePath}
            clearGradeClassroomOnChange={clearGradeClassroomOnChange}
          />
        ) : null}
        <UserMenu />
      </div>
    </header>
  );
}
