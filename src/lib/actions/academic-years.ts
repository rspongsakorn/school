"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { isValidDateRange } from "@/lib/academic-year/validation";
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

function validateYear(input: YearInput): string | null {
  if (!input.name.trim()) return "กรุณากรอกชื่อปีการศึกษา";
  if (!input.startDate || !input.endDate) return "กรุณากรอกวันที่เริ่มและสิ้นสุด";
  if (!isValidDateRange(input.startDate, input.endDate)) {
    return "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม";
  }
  return null;
}

function validateSemesters(semesters: SemesterInput[]): string | null {
  for (const sem of semesters) {
    if (!sem.startDate || !sem.endDate) return `กรุณากรอกวันที่ภาคเรียนที่ ${sem.number}`;
    if (!isValidDateRange(sem.startDate, sem.endDate)) {
      return `วันที่ภาคเรียนที่ ${sem.number} ไม่ถูกต้อง`;
    }
  }
  return null;
}

async function unsetOtherActiveYears(
  supabase: Awaited<ReturnType<typeof createClient>>,
  exceptId?: string,
) {
  let query = supabase.from("academic_years").update({ is_active: false }).eq("is_active", true);
  if (exceptId) {
    query = query.neq("id", exceptId);
  }
  await query;
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

  const supabase = await createClient();

  if (year.isActive) {
    await unsetOtherActiveYears(supabase);
  }

  const { data: createdYear, error: yearInsertError } = await supabase
    .from("academic_years")
    .insert({
      name: year.name.trim(),
      start_date: year.startDate,
      end_date: year.endDate,
      is_active: year.isActive,
    })
    .select("id")
    .single();

  if (yearInsertError || !createdYear) {
    return { ok: false, error: "ไม่สามารถสร้างปีการศึกษาได้" };
  }

  const semesterRows = semesters.map((s) => ({
    academic_year_id: createdYear.id,
    number: s.number,
    name: s.name.trim() || null,
    start_date: s.startDate,
    end_date: s.endDate,
  }));

  const { error: semInsertError } = await supabase.from("semesters").insert(semesterRows);

  if (semInsertError) {
    await supabase.from("academic_years").delete().eq("id", createdYear.id);
    return { ok: false, error: "ไม่สามารถสร้างภาคเรียนได้" };
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

  const supabase = await createClient();

  if (year.isActive) {
    await unsetOtherActiveYears(supabase, yearId);
  }

  const { error: yearUpdateError } = await supabase
    .from("academic_years")
    .update({
      name: year.name.trim(),
      start_date: year.startDate,
      end_date: year.endDate,
      is_active: year.isActive,
    })
    .eq("id", yearId);

  if (yearUpdateError) {
    return { ok: false, error: "ไม่สามารถแก้ไขปีการศึกษาได้" };
  }

  for (const sem of semesters) {
    const { error } = await supabase
      .from("semesters")
      .update({
        name: sem.name.trim() || null,
        start_date: sem.startDate,
        end_date: sem.endDate,
      })
      .eq("academic_year_id", yearId)
      .eq("number", sem.number);

    if (error) {
      return { ok: false, error: `ไม่สามารถแก้ไขภาคเรียนที่ ${sem.number} ได้` };
    }
  }

  revalidatePath("/academic-year");
  return { ok: true };
}
