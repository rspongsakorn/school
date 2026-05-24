"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { getSemesterById } from "@/lib/data/semesters";
import { validateGradeLevelName } from "@/lib/enrollment/validation";
import { createClient } from "@/lib/supabase/server";

function revalidateRegistrationPaths() {
  revalidatePath("/registration");
  revalidatePath("/students");
}

export async function createGradeLevel(
  semesterId: string,
  input: { name: string; sortOrder?: number },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validation = validateGradeLevelName(input.name);
  if (!validation.ok) return { ok: false, error: validation.error };

  const semester = await getSemesterById(semesterId);
  if (!semester) return { ok: false, error: "ไม่พบภาคเรียน" };

  const supabase = await createClient();
  const { error } = await supabase.from("grade_levels").insert({
    semester_id: semesterId,
    academic_year_id: semester.academic_year_id,
    name: input.name.trim(),
    sort_order: input.sortOrder ?? 0,
  });

  if (error?.code === "23505") {
    return { ok: false, error: "ชื่อชั้นเรียนนี้มีอยู่แล้วในภาคเรียนนี้" };
  }
  if (error) return { ok: false, error: "ไม่สามารถเพิ่มชั้นเรียนได้" };

  revalidateRegistrationPaths();
  return { ok: true };
}

export async function updateGradeLevel(
  id: string,
  input: { name: string; sortOrder?: number },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validation = validateGradeLevelName(input.name);
  if (!validation.ok) return { ok: false, error: validation.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("grade_levels")
    .update({
      name: input.name.trim(),
      sort_order: input.sortOrder ?? 0,
    })
    .eq("id", id);

  if (error?.code === "23505") {
    return { ok: false, error: "ชื่อชั้นเรียนนี้มีอยู่แล้วในภาคเรียนนี้" };
  }
  if (error) return { ok: false, error: "ไม่สามารถแก้ไขชั้นเรียนได้" };

  revalidateRegistrationPaths();
  return { ok: true };
}

export async function deleteGradeLevel(id: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id")
    .eq("grade_level_id", id);

  if (classrooms && classrooms.length > 0) {
    const classroomIds = classrooms.map((c) => c.id);
    const { count } = await supabase
      .from("student_enrollments")
      .select("id", { count: "exact", head: true })
      .in("classroom_id", classroomIds);

    if ((count ?? 0) > 0) {
      return { ok: false, error: "ไม่สามารถลบได้ — มีนักเรียนลงทะเบียนอยู่" };
    }
    return { ok: false, error: "ไม่สามารถลบได้ — มีห้องเรียนในชั้นนี้ กรุณาลบห้องก่อน" };
  }

  const { error } = await supabase.from("grade_levels").delete().eq("id", id);
  if (error) return { ok: false, error: "ไม่สามารถลบชั้นเรียนได้" };

  revalidateRegistrationPaths();
  return { ok: true };
}
