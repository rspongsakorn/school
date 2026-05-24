"use server";

import { revalidatePath } from "next/cache";
import {
  firstSemesterFormError,
  firstYearFormError,
  validateSemesterForm,
  validateYearForm,
} from "@/lib/academic-year/form-validation";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok: true } | { ok: false; error: string };

type YearInput = {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type SemesterInput = {
  number: 1 | 2;
  name: string;
  startDate: string;
  endDate: string;
};

function validateYear(year: YearInput): string | null {
  const result = validateYearForm(year);
  if (!result.ok) return firstYearFormError(result.errors);
  return null;
}

function validateSemesters(semesters: SemesterInput[]): string | null {
  for (const sem of semesters) {
    const result = validateSemesterForm(sem, sem.number);
    if (!result.ok) return firstSemesterFormError(result.errors);
  }
  return null;
}

function mapAcademicYearMutationError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") {
    return "มีปีการศึกษาที่ใช้งานอยู่แล้ว กรุณารีเฟรชแล้วลองใหม่";
  }
  if (error.code === "42501") {
    return "ไม่มีสิทธิ์ดำเนินการ";
  }
  return "ไม่สามารถบันทึกปีการศึกษาได้";
}

function semesterByNumber(semesters: SemesterInput[], number: 1 | 2): SemesterInput {
  const semester = semesters.find((s) => s.number === number);
  if (!semester) {
    throw new Error(`Missing semester ${number}`);
  }
  return semester;
}

export async function createYearWithSemesters(
  year: YearInput,
  semesters: SemesterInput[],
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const yearError = validateYear(year);
  if (yearError) return { ok: false, error: yearError };

  const semError = validateSemesters(semesters);
  if (semError) return { ok: false, error: semError };

  const sem1 = semesterByNumber(semesters, 1);
  const sem2 = semesterByNumber(semesters, 2);
  const supabase = await createClient();

  const { error } = await supabase.rpc("create_academic_year_with_semesters", {
    p_name: year.name.trim(),
    p_start_date: year.startDate,
    p_end_date: year.endDate,
    p_is_active: year.isActive,
    p_sem1_start: sem1.startDate,
    p_sem1_end: sem1.endDate,
    p_sem1_name: sem1.name,
    p_sem2_start: sem2.startDate,
    p_sem2_end: sem2.endDate,
    p_sem2_name: sem2.name,
  });

  if (error) {
    return { ok: false, error: mapAcademicYearMutationError(error) };
  }

  revalidatePath("/academic-year");
  return { ok: true };
}

export async function updateYearWithSemesters(
  yearId: string,
  year: YearInput,
  semesters: SemesterInput[],
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const yearError = validateYear(year);
  if (yearError) return { ok: false, error: yearError };

  const semError = validateSemesters(semesters);
  if (semError) return { ok: false, error: semError };

  const sem1 = semesterByNumber(semesters, 1);
  const sem2 = semesterByNumber(semesters, 2);
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_academic_year_with_semesters", {
    p_year_id: yearId,
    p_name: year.name.trim(),
    p_start_date: year.startDate,
    p_end_date: year.endDate,
    p_is_active: year.isActive,
    p_sem1_start: sem1.startDate,
    p_sem1_end: sem1.endDate,
    p_sem1_name: sem1.name,
    p_sem2_start: sem2.startDate,
    p_sem2_end: sem2.endDate,
    p_sem2_name: sem2.name,
  });

  if (error) {
    return { ok: false, error: mapAcademicYearMutationError(error) };
  }

  revalidatePath("/academic-year");
  return { ok: true };
}
