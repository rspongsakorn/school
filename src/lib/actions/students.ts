"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import type { StudentStatus } from "@/lib/students/constants";
import { createClient } from "@/lib/supabase/server";

export type { ActionState };

type StudentFormInput = {
  studentCode: string;
  firstName: string;
  lastName: string;
  idCard: string;
  status: StudentStatus;
};

function validateStudent(input: StudentFormInput): string | null {
  if (!input.studentCode.trim()) return "กรุณากรอกรหัสนักเรียน";
  if (!input.firstName.trim()) return "กรุณากรอกชื่อ";
  if (!input.lastName.trim()) return "กรุณากรอกนามสกุล";
  return null;
}

export async function createStudent(input: StudentFormInput): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validationError = validateStudent(input);
  if (validationError) return { ok: false, error: validationError };

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

  const validationError = validateStudent(input);
  if (validationError) return { ok: false, error: validationError };

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

export async function deleteStudent(id: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const [enrollments, invoices, payments] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", id),
    supabase
      .from("student_invoices")
      .select("id", { count: "exact", head: true })
      .eq("student_id", id),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", id),
  ]);

  const refCount =
    (enrollments.count ?? 0) + (invoices.count ?? 0) + (payments.count ?? 0);

  if (refCount > 0) {
    return {
      ok: false,
      error: "ไม่สามารถลบได้ — มีประวัติการลงทะเบียนหรือใบแจ้งชำระ กรุณาเปลี่ยนสถานะแทน",
    };
  }

  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };

  revalidatePath("/students");
  return { ok: true };
}
