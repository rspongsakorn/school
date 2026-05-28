"use client";

import { AppHeader } from "@/components/app-header";
import { AcademicYearFormPage } from "@/components/academic-year/academic-year-form-page";
import { useRequireRole } from "@/components/providers/auth-provider";

export function NewAcademicYearShell() {
  useRequireRole("admin");

  return (
    <>
      <AppHeader title="เพิ่มปีการศึกษา" />
      <main className="p-4 lg:p-6">
        <AcademicYearFormPage mode="create" />
      </main>
    </>
  );
}
