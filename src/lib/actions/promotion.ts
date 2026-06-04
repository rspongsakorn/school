"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { buildPromotionPlan, type PromotionPlan } from "@/lib/data/promotion";
import { createClient } from "@/lib/supabase/server";

export type PromotionPreviewResult =
  | { ok: true; plan: PromotionPlan }
  | { ok: false; error: string };

export type ExecutePromotionInput = {
  targetSemesterId: string;
  enrollments: { studentId: string; targetClassroomId: string }[];
  graduateStudentIds: string[];
};

export type ExecutePromotionResult =
  | { ok: true; enrolled: number; skipped: number; graduated: number }
  | { ok: false; error: string };

export async function getPromotionPreview(
  sourceSemesterId: string,
  targetSemesterId: string,
): Promise<PromotionPreviewResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  if (!sourceSemesterId || !targetSemesterId) {
    return { ok: false, error: "กรุณาเลือกภาคเรียนต้นทางและปลายทาง" };
  }
  if (sourceSemesterId === targetSemesterId) {
    return { ok: false, error: "ภาคต้นทางและปลายทางต้องไม่ใช่ภาคเดียวกัน" };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("grade_levels")
    .select("id", { count: "exact", head: true })
    .eq("semester_id", targetSemesterId);

  if ((count ?? 0) === 0) {
    return { ok: false, error: "ภาคปลายทางยังไม่มีชั้นเรียน — กรุณาตั้งค่าโครงสร้างก่อน" };
  }

  const plan = await buildPromotionPlan(sourceSemesterId, targetSemesterId);
  return { ok: true, plan };
}

export async function executePromotion(
  input: ExecutePromotionInput,
): Promise<ExecutePromotionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const { targetSemesterId, enrollments, graduateStudentIds } = input;
  if (!targetSemesterId) {
    return { ok: false, error: "ไม่พบภาคเรียนปลายทาง" };
  }

  const supabase = await createClient();

  // ดึง academic_year_id ของห้องปลายทางที่เกี่ยวข้อง
  const targetClassroomIds = [...new Set(enrollments.map((e) => e.targetClassroomId))];
  let enrolled = 0;
  let skipped = 0;

  if (targetClassroomIds.length > 0) {
    const { data: classrooms } = await supabase
      .from("classrooms")
      .select("id, academic_year_id, semester_id")
      .in("id", targetClassroomIds);

    const classroomMeta = new Map(
      (classrooms ?? []).map((c) => [c.id, c]),
    );

    // ข้ามนักเรียนที่มี enrollment ในภาคปลายทางแล้ว
    const studentIds = enrollments.map((e) => e.studentId);
    const { data: existing } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("semester_id", targetSemesterId)
      .in("student_id", studentIds);
    const existingSet = new Set((existing ?? []).map((r) => r.student_id));

    const rows = enrollments
      .filter((e) => {
        if (existingSet.has(e.studentId)) {
          skipped += 1;
          return false;
        }
        return classroomMeta.has(e.targetClassroomId);
      })
      .map((e) => {
        const meta = classroomMeta.get(e.targetClassroomId)!;
        return {
          student_id: e.studentId,
          classroom_id: e.targetClassroomId,
          academic_year_id: meta.academic_year_id,
          semester_id: meta.semester_id,
          status: "enrolled" as const,
        };
      });

    if (rows.length > 0) {
      const { error } = await supabase.from("student_enrollments").insert(rows);
      if (error && error.code !== "23505") {
        return { ok: false, error: "ไม่สามารถลงทะเบียนนักเรียนได้" };
      }
      enrolled = rows.length;
    }
  }

  let graduated = 0;
  if (graduateStudentIds.length > 0) {
    const { error } = await supabase
      .from("students")
      .update({ status: "graduated" })
      .in("id", graduateStudentIds);
    if (error) {
      return { ok: false, error: "ลงทะเบียนสำเร็จ แต่ตั้งสถานะจบการศึกษาไม่สำเร็จ" };
    }
    graduated = graduateStudentIds.length;
  }

  revalidatePath("/registration");
  revalidatePath("/students");
  return { ok: true, enrolled, skipped, graduated };
}
