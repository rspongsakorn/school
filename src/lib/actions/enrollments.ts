"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import type { EnrollmentStatus } from "@/lib/enrollment/constants";
import { canDeleteEnrollment } from "@/lib/enrollment/enrollment-delete-eligibility";
import { isValidEnrollmentStatus } from "@/lib/enrollment/validation";
import { listStudentsAvailableForEnrollment } from "@/lib/data/enrollments";
import { createClient } from "@/lib/supabase/server";

function revalidateRegistrationPaths() {
  revalidatePath("/registration");
  revalidatePath("/students");
}

export async function searchStudentsForEnrollment(
  semesterId: string,
  query: string,
): Promise<{ studentId: string; studentCode: string; name: string }[]> {
  const auth = await requireAdminAction();
  if (!auth.ok) return [];

  return listStudentsAvailableForEnrollment(semesterId, query);
}

export async function enrollStudent(
  studentId: string,
  classroomId: string,
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: classroom, error: classroomError } = await supabase
    .from("classrooms")
    .select("id, academic_year_id, semester_id")
    .eq("id", classroomId)
    .maybeSingle();

  if (classroomError || !classroom) {
    return { ok: false, error: "ไม่พบห้องเรียน" };
  }

  const { data: existing } = await supabase
    .from("student_enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("semester_id", classroom.semester_id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("student_enrollments")
      .update({
        classroom_id: classroomId,
        status: "enrolled",
      })
      .eq("id", existing.id);

    if (error) return { ok: false, error: "ไม่สามารถลงทะเบียนได้" };
  } else {
    const { error } = await supabase.from("student_enrollments").insert({
      student_id: studentId,
      classroom_id: classroomId,
      academic_year_id: classroom.academic_year_id,
      semester_id: classroom.semester_id,
      status: "enrolled",
    });

    if (error?.code === "23505") {
      return { ok: false, error: "นักเรียนลงทะเบียนในภาคนี้แล้ว" };
    }
    if (error) return { ok: false, error: "ไม่สามารถลงทะเบียนได้" };
  }

  revalidateRegistrationPaths();
  return { ok: true };
}

export async function moveStudentClassroom(
  enrollmentId: string,
  newClassroomId: string,
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("id, academic_year_id, semester_id, status")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!enrollment) return { ok: false, error: "ไม่พบข้อมูลการลงทะเบียน" };
  if (enrollment.status !== "enrolled") {
    return { ok: false, error: "ย้ายห้องได้เฉพาะนักเรียนที่กำลังเรียน" };
  }

  const { data: classroom } = await supabase
    .from("classrooms")
    .select("id, academic_year_id, semester_id")
    .eq("id", newClassroomId)
    .maybeSingle();

  if (!classroom) return { ok: false, error: "ไม่พบห้องเรียน" };
  if (classroom.semester_id !== enrollment.semester_id) {
    return { ok: false, error: "ห้องเรียนต้องอยู่ในภาคเรียนเดียวกัน" };
  }

  const { error } = await supabase
    .from("student_enrollments")
    .update({ classroom_id: newClassroomId })
    .eq("id", enrollmentId);

  if (error) return { ok: false, error: "ไม่สามารถย้ายห้องได้" };

  revalidateRegistrationPaths();
  return { ok: true };
}

export async function updateEnrollmentStatus(
  enrollmentId: string,
  status: Exclude<EnrollmentStatus, "enrolled">,
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  if (!isValidEnrollmentStatus(status)) {
    return { ok: false, error: "สถานะไม่ถูกต้อง" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("student_enrollments")
    .update({ status })
    .eq("id", enrollmentId);

  if (error) return { ok: false, error: "ไม่สามารถเปลี่ยนสถานะได้" };

  revalidateRegistrationPaths();
  return { ok: true };
}

export async function deleteEnrollment(enrollmentId: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("id, student_id, semester_id, status")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!enrollment) return { ok: false, error: "ไม่พบข้อมูลการลงทะเบียน" };
  if (enrollment.status !== "enrolled") {
    return { ok: false, error: "ลบออกจากห้องได้เฉพาะนักเรียนที่กำลังเรียน" };
  }

  const { count } = await supabase
    .from("student_invoices")
    .select("id", { count: "exact", head: true })
    .eq("student_id", enrollment.student_id)
    .eq("semester_id", enrollment.semester_id);

  if (
    !canDeleteEnrollment({
      status: enrollment.status,
      hasInvoiceInSemester: (count ?? 0) > 0,
    })
  ) {
    return {
      ok: false,
      error: "มีใบแจ้งชำระแล้ว — ใช้เปลี่ยนสถานะแทน",
    };
  }

  const { error } = await supabase.from("student_enrollments").delete().eq("id", enrollmentId);
  if (error) return { ok: false, error: "ไม่สามารถลบการลงทะเบียนได้" };

  revalidateRegistrationPaths();
  revalidatePath("/invoices");
  revalidatePath("/reports/outstanding");
  revalidatePath("/reports/collections");
  return { ok: true };
}

export async function enrollStudents(
  studentIds: string[],
  classroomId: string,
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  if (studentIds.length === 0) return { ok: true };

  const supabase = await createClient();

  const { data: classroom, error: classroomError } = await supabase
    .from("classrooms")
    .select("id, academic_year_id, semester_id")
    .eq("id", classroomId)
    .maybeSingle();

  if (classroomError || !classroom) {
    return { ok: false, error: "ไม่พบห้องเรียน" };
  }

  // ดึง existing enrollments ของ studentIds ทั้งหมดในภาคนี้ (batch)
  const { data: existing } = await supabase
    .from("student_enrollments")
    .select("id, student_id")
    .eq("semester_id", classroom.semester_id)
    .in("student_id", studentIds);

  const existingMap = new Map((existing ?? []).map((e) => [e.student_id, e.id]));
  const toUpdate = studentIds.filter((id) => existingMap.has(id));
  const toInsert = studentIds.filter((id) => !existingMap.has(id));

  if (toUpdate.length > 0) {
    const enrollmentIds = toUpdate.map((sid) => existingMap.get(sid)!);
    const { error } = await supabase
      .from("student_enrollments")
      .update({ classroom_id: classroomId, status: "enrolled" })
      .in("id", enrollmentIds);
    if (error) return { ok: false, error: "ไม่สามารถลงทะเบียนได้" };
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map((studentId) => ({
      student_id: studentId,
      classroom_id: classroomId,
      academic_year_id: classroom.academic_year_id,
      semester_id: classroom.semester_id,
      status: "enrolled" as const,
    }));
    const { error } = await supabase.from("student_enrollments").insert(rows);
    if (error?.code === "23505") {
      return { ok: false, error: "นักเรียนบางคนลงทะเบียนในภาคนี้แล้ว" };
    }
    if (error) return { ok: false, error: "ไม่สามารถลงทะเบียนได้" };
  }

  revalidateRegistrationPaths();
  return { ok: true };
}
