"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import {
  assertSemesterDeletable,
  semesterDeleteBlockedMessage,
} from "@/lib/academic-year/delete-eligibility";
import {
  firstSemesterFormError,
  validateSemesterForm,
} from "@/lib/academic-year/form-validation";
import { nextSemesterDefaultDates } from "@/lib/academic-year/semester-dates";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/academic-year");
  revalidatePath("/registration");
  revalidatePath("/students");
  revalidatePath("/");
}

export async function addSemester(
  academicYearId: string,
  input?: { name?: string; startDate?: string; endDate?: string },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: year } = await supabase
    .from("academic_years")
    .select("start_date, end_date")
    .eq("id", academicYearId)
    .maybeSingle();

  if (!year) return { ok: false, error: "ไม่พบปีการศึกษา" };

  const { data: existing } = await supabase
    .from("semesters")
    .select("number, start_date, end_date")
    .eq("academic_year_id", academicYearId);

  const maxNumber = (existing ?? []).reduce((max, row) => Math.max(max, row.number), 0);
  const defaults = nextSemesterDefaultDates(year.start_date, year.end_date, existing ?? []);
  const nextNumber = maxNumber + 1;
  const draft = {
    startDate: input?.startDate ?? defaults.start,
    endDate: input?.endDate ?? defaults.end,
  };

  const validation = validateSemesterForm(draft, nextNumber);
  if (!validation.ok) {
    return { ok: false, error: firstSemesterFormError(validation.errors) };
  }

  const { error } = await supabase.from("semesters").insert({
    academic_year_id: academicYearId,
    number: nextNumber,
    name: input?.name?.trim() || null,
    start_date: draft.startDate,
    end_date: draft.endDate,
  });

  if (error?.code === "23505") {
    return { ok: false, error: "เลขภาคเรียนนี้มีอยู่แล้ว" };
  }
  if (error) return { ok: false, error: "ไม่สามารถเพิ่มภาคเรียนได้" };

  revalidateAll();
  return { ok: true };
}

export async function updateSemester(
  semesterId: string,
  input: { name: string; startDate: string; endDate: string },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("semesters")
    .select("number")
    .eq("id", semesterId)
    .maybeSingle();

  if (!row) return { ok: false, error: "ไม่พบภาคเรียน" };

  const validation = validateSemesterForm(
    { startDate: input.startDate, endDate: input.endDate },
    row.number,
  );
  if (!validation.ok) {
    return { ok: false, error: firstSemesterFormError(validation.errors) };
  }

  const { error } = await supabase
    .from("semesters")
    .update({
      name: input.name.trim() || null,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .eq("id", semesterId);

  if (error) return { ok: false, error: "ไม่สามารถแก้ไขภาคเรียนได้" };

  revalidateAll();
  return { ok: true };
}

export async function deleteSemester(semesterId: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const check = await assertSemesterDeletable(semesterId);
  if (!check.ok) {
    return { ok: false, error: semesterDeleteBlockedMessage() };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("semesters").delete().eq("id", semesterId);
  if (error) return { ok: false, error: "ไม่สามารถลบภาคเรียนได้" };

  revalidateAll();
  return { ok: true };
}
