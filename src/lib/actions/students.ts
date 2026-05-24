"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { getStudentReferenceCounts, isStudentDeletable } from "@/lib/data/students";
import { studentHasBlockingReferences } from "@/lib/students/delete-eligibility";
import {
  firstStudentFormError,
  validateStudentForm,
  type StudentFormInput,
} from "@/lib/students/validation";
import { createClient } from "@/lib/supabase/server";

export async function createStudent(input: StudentFormInput): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validation = validateStudentForm(input);
  if (!validation.ok) {
    return { ok: false, error: firstStudentFormError(validation.errors) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("students").insert({
    student_code: input.studentCode.trim(),
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    id_card: input.idCard.trim() || null,
    status: input.status,
  });

  if (error?.code === "23505") {
    return { ok: false, error: "รหัสนักเรียนนี้มีอยู่แล้ว" };
  }
  if (error) return { ok: false, error: "ไม่สามารถเพิ่มนักเรียนได้" };

  revalidatePath("/students");
  return { ok: true };
}

export async function updateStudent(id: string, input: StudentFormInput): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validation = validateStudentForm(input);
  if (!validation.ok) {
    return { ok: false, error: firstStudentFormError(validation.errors) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({
      student_code: input.studentCode.trim(),
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      id_card: input.idCard.trim() || null,
      status: input.status,
    })
    .eq("id", id);

  if (error?.code === "23505") {
    return { ok: false, error: "รหัสนักเรียนนี้มีอยู่แล้ว" };
  }
  if (error) return { ok: false, error: "ไม่สามารถแก้ไขนักเรียนได้" };

  revalidatePath("/students");
  return { ok: true };
}

const STUDENT_DELETE_BLOCKED_MESSAGE =
  "ไม่สามารถลบได้ — มีประวัติการลงทะเบียนหรือใบแจ้งชำระ กรุณาเปลี่ยนสถานะแทน";

async function deleteStudentRecord(studentId: string): Promise<ActionState> {
  const counts = await getStudentReferenceCounts(studentId);
  if (!isStudentDeletable(counts)) {
    return { ok: false, error: STUDENT_DELETE_BLOCKED_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("students").delete().eq("id", studentId);
  if (error) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };

  return { ok: true };
}

export async function deleteStudent(id: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const result = await deleteStudentRecord(id);
  if (result.ok) revalidatePath("/students");
  return result;
}

export type DeleteStudentsResult =
  | { ok: true; deleted: number; skipped: number }
  | { ok: false; error: string };

export async function deleteStudents(studentIds: string[]): Promise<DeleteStudentsResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const uniqueIds = [...new Set(studentIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { ok: false, error: "กรุณาเลือกนักเรียนที่ต้องการลบ" };
  }

  const supabase = await createClient();
  const [enrollments, invoices, payments] = await Promise.all([
    supabase.from("student_enrollments").select("student_id").in("student_id", uniqueIds),
    supabase.from("student_invoices").select("student_id").in("student_id", uniqueIds),
    supabase.from("payments").select("student_id").in("student_id", uniqueIds),
  ]);

  const blockedIds = new Set<string>();
  for (const row of enrollments.data ?? []) blockedIds.add(row.student_id);
  for (const row of invoices.data ?? []) blockedIds.add(row.student_id);
  for (const row of payments.data ?? []) blockedIds.add(row.student_id);

  const deletableIds = uniqueIds.filter((id) => !blockedIds.has(id));
  const skipped = uniqueIds.length - deletableIds.length;

  if (deletableIds.length === 0) {
    return {
      ok: false,
      error: "ไม่สามารถลบได้ — นักเรียนที่เลือกมีประวัติการลงทะเบียนหรือการเงิน",
    };
  }

  for (const studentId of deletableIds) {
    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) {
      return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };
    }
  }

  revalidatePath("/students");
  revalidatePath("/registration");
  revalidatePath("/invoices");
  revalidatePath("/payments");
  return { ok: true, deleted: deletableIds.length, skipped };
}
