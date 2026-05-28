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
  const { isOpen, open } = useSidebarContext();

  const showSelectors = Boolean(basePath && ctx);
  const subtitleYear = ctx?.academicYearName;
  const subtitleSemester = ctx?.semesterNumber ?? 1;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center">
        <button
          type="button"
          className="-ml-1 mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent lg:hidden"
          onClick={open}
          aria-label="เปิดเมนู"
          aria-expanded={isOpen}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground lg:text-xl">{title}</h1>
          {subtitleYear ? (
            <p className="truncate text-xs text-muted-foreground">
              ภาคเรียนที่ {subtitleSemester} · ปี {subtitleYear}
            </p>
          ) : null}
        </div>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2 lg:gap-4">
        {showSelectors && ctx && basePath ? (
          <div className="hidden sm:block">
            <YearSemesterSelect
              years={years}
              semesters={semesters}
              selectedYearId={ctx.academicYearId}
              selectedSemesterNumber={ctx.semesterNumber}
              basePath={basePath}
              clearGradeClassroomOnChange={clearGradeClassroomOnChange}
            />
          </div>
        ) : null}
        <UserMenu />
      </div>
    </header>
  );
}
