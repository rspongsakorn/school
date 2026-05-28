"use client";

import { Menu } from "lucide-react";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { UserMenu } from "@/components/auth/user-menu";
import { YearSemesterSelect } from "@/components/context/year-semester-select";
import { useSidebarContext } from "@/hooks/use-sidebar";

type AppHeaderProps = {
  title: string;
  basePath?: string;
  clearGradeClassroomOnChange?: boolean;
};

export function AppHeader({ title, basePath, clearGradeClassroomOnChange = false }: AppHeaderProps) {
  const { years, semesters, ctx } = useSemesterContext();
  const { open } = useSidebarContext();

  const showSelectors = Boolean(basePath && ctx);
  const subtitleYear = ctx?.academicYearName;
  const subtitleSemester = ctx?.semesterNumber ?? 1;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center">
        <button
          type="button"
          className="-ml-1 mr-3 flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent lg:hidden"
          onClick={open}
          aria-label="เปิดเมนู"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitleYear ? (
            <p className="text-xs text-muted-foreground">
              ภาคเรียนที่ {subtitleSemester} · ปี {subtitleYear}
            </p>
          ) : null}
        </div>
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
