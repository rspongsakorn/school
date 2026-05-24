"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { validateClassroomName } from "@/lib/enrollment/validation";
import { createClient } from "@/lib/supabase/server";

function revalidateRegistrationPaths() {
  revalidatePath("/registration/setup");
  revalidatePath("/registration");
}

export async function createClassroom(
  academicYearId: string,
  gradeLevelId: string,
  input: { name: string },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validation = validateClassroomName(input.name);
  if (!validation.ok) return { ok: false, error: validation.error };

  const supabase = await createClient();
  const { error } = await supabase.from("classrooms").insert({
    academic_year_id: academicYearId,
    grade_level_id: gradeLevelId,
    name: input.name.trim(),
  });

  if (error?.code === "23505") {
    return { ok: false, error: "ชื่อห้องเรียนนี้มีอยู่แล้วในชั้นนี้" };
  }
  if (error) return { ok: false, error: "ไม่สามารถเพิ่มห้องเรียนได้" };

  revalidateRegistrationPaths();
  return { ok: true };
}

export async function updateClassroom(
  id: string,
  input: { name: string },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validation = validateClassroomName(input.name);
  if (!validation.ok) return { ok: false, error: validation.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("classrooms")
    .update({ name: input.name.trim() })
    .eq("id", id);

  if (error?.code === "23505") {
    return { ok: false, error: "ชื่อห้องเรียนนี้มีอยู่แล้วในชั้นนี้" };
  }
  if (error) return { ok: false, error: "ไม่สามารถแก้ไขห้องเรียนได้" };

  revalidateRegistrationPaths();
  return { ok: true };
}

export async function deleteClassroom(id: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { count } = await supabase
    .from("student_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("classroom_id", id);

  if ((count ?? 0) > 0) {
    return { ok: false, error: "ไม่สามารถลบได้ — มีนักเรียนลงทะเบียนอยู่" };
  }

  const { error } = await supabase.from("classrooms").delete().eq("id", id);
  if (error) return { ok: false, error: "ไม่สามารถลบห้องเรียนได้" };

  revalidateRegistrationPaths();
  return { ok: true };
}
