"use client";

import { useQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { useRequireRole } from "@/components/providers/auth-provider";
import { fetchAcademicYearById } from "@/lib/queries/academic-years";
import { AppHeader } from "@/components/app-header";
import { AcademicYearFormPage } from "@/components/academic-year/academic-year-form-page";

export function EditAcademicYearWrapper({ id }: { id: string }) {
  useRequireRole("admin");

  const {
    data: year,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["academic-year", id],
    queryFn: () => fetchAcademicYearById(id),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <>
        <AppHeader title="แก้ไขปีการศึกษา" />
        <main className="p-6">
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </main>
      </>
    );
  }

  if (isError || !year) return notFound();

  return (
    <>
      <AppHeader title="แก้ไขปีการศึกษา" />
      <main className="p-6">
        <AcademicYearFormPage mode="edit" year={year} />
      </main>
    </>
  );
}
