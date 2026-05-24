"use server";

import { revalidatePath } from "next/cache";
import {
  assertAcademicYearDeletable,
  yearDeleteBlockedMessage,
} from "@/lib/academic-year/delete-eligibility";
import {
  firstSemesterFormError,
  firstYearFormError,
  validateSemesterForm,
  validateYearForm,
} from "@/lib/academic-year/form-validation";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok: true } | { ok: false; error: string };

export type CreateYearResult =
  | { ok: true; yearId: string }
  | { ok: false; error: string };

type YearInput = {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type SemesterInput = {
  number: number;
  name: string;
  startDate: string;
  endDate: string;
};

function revalidateAll() {
  revalidatePath("/academic-year");
  revalidatePath("/registration");
  revalidatePath("/students");
  revalidatePath("/");
}

function validateYear(year: YearInput): string | null {
  const result = validateYearForm(year);
  if (!result.ok) return firstYearFormError(result.errors);
  return null;
}

function validateSemesters(semesters: SemesterInput[]): string | null {
  if (semesters.length === 0) {
    return "ต้องมีอย่างน้อย 1 ภาคเรียน";
  }
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

export async function createYearWithSemesters(
  year: YearInput,
  semesters: SemesterInput[],
): Promise<CreateYearResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const yearError = validateYear(year);
  if (yearError) return { ok: false, error: yearError };

  const semError = validateSemesters(semesters);
  if (semError) return { ok: false, error: semError };

  const sem1 = semesters.find((s) => s.number === 1) ?? semesters[0];
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_academic_year_with_semesters", {
    p_name: year.name.trim(),
    p_start_date: year.startDate,
    p_end_date: year.endDate,
    p_is_active: year.isActive,
    p_sem1_start: sem1.startDate,
    p_sem1_end: sem1.endDate,
    p_sem1_name: sem1.name,
  });

  if (error) {
    return { ok: false, error: mapAcademicYearMutationError(error) };
  }

  if (!data) {
    return { ok: false, error: "ไม่สามารถสร้างปีการศึกษาได้" };
  }

  revalidatePath("/academic-year");
  return { ok: true, yearId: data as string };
}

export async function updateYearMetadata(
  yearId: string,
  year: YearInput,
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const yearError = validateYear(year);
  if (yearError) return { ok: false, error: yearError };

  const supabase = await createClient();

  if (year.isActive) {
    await supabase
      .from("academic_years")
      .update({ is_active: false })
      .eq("is_active", true)
      .neq("id", yearId);
  }

  const { error } = await supabase
    .from("academic_years")
    .update({
      name: year.name.trim(),
      start_date: year.startDate,
      end_date: year.endDate,
      is_active: year.isActive,
    })
    .eq("id", yearId);

  if (error) {
    return { ok: false, error: mapAcademicYearMutationError(error) };
  }

  revalidateAll();
  return { ok: true };
}

/** @deprecated Use updateYearMetadata + semester actions */
export async function updateYearWithSemesters(
  yearId: string,
  year: YearInput,
  semesters: SemesterInput[],
): Promise<ActionState> {
  const metadata = await updateYearMetadata(yearId, year);
  if (!metadata.ok) return metadata;

  const { updateSemester } = await import("@/lib/actions/semesters");
  for (const sem of semesters) {
    const supabase = await createClient();
    const { data: row } = await supabase
      .from("semesters")
      .select("id")
      .eq("academic_year_id", yearId)
      .eq("number", sem.number)
      .maybeSingle();

    if (row) {
      const result = await updateSemester(row.id, {
        name: sem.name,
        startDate: sem.startDate,
        endDate: sem.endDate,
      });
      if (!result.ok) return result;
    }
  }

  return { ok: true };
}

export async function deleteAcademicYear(yearId: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const check = await assertAcademicYearDeletable(yearId);
  if (!check.ok) {
    return { ok: false, error: yearDeleteBlockedMessage(check.reason) };
  }

  const supabase = await createClient();
  const { error: semError } = await supabase
    .from("semesters")
    .delete()
    .eq("academic_year_id", yearId);

  if (semError) {
    return { ok: false, error: "ไม่สามารถลบปีการศึกษาได้" };
  }

  const { error } = await supabase.from("academic_years").delete().eq("id", yearId);
  if (error) return { ok: false, error: "ไม่สามารถลบปีการศึกษาได้" };

  revalidateAll();
  return { ok: true };
}
