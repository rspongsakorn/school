"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { listClassroomsByGrade } from "@/lib/data/classrooms";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { getSemesterById } from "@/lib/data/semesters";
import { buildCarryForwardEnrollments } from "@/lib/enrollment/carry-forward";
import { createClient } from "@/lib/supabase/server";

export type CopyStructureResult =
  | { ok: true; enrolledCount: number }
  | { ok: false; error: string };

function revalidateRegistrationPaths() {
  revalidatePath("/registration");
  revalidatePath("/students");
}

export async function copySemesterStructure(
  sourceSemesterId: string,
  targetSemesterId: string,
  includeStudents = false,
): Promise<CopyStructureResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const [source, target] = await Promise.all([
    getSemesterById(sourceSemesterId),
    getSemesterById(targetSemesterId),
  ]);

  if (!source) return { ok: false, error: "ไม่พบภาคเรียนต้นทาง" };
  if (!target) return { ok: false, error: "ไม่พบภาคเรียนปลายทาง" };

  if (source.academic_year_id !== target.academic_year_id) {
    return { ok: false, error: "คัดลอกได้เฉพาะภายในปีการศึกษาเดียวกัน" };
  }

  if (source.id === target.id) {
    return { ok: false, error: "ไม่สามารถคัดลอกไปยังภาคเรียนเดียวกันได้" };
  }

  const existingGrades = await listGradeLevels(targetSemesterId);
  if (existingGrades.length > 0) {
    return { ok: false, error: "ภาคเรียนนี้มีชั้นเรียนอยู่แล้ว" };
  }

  const sourceGrades = await listGradeLevels(sourceSemesterId);
  if (sourceGrades.length === 0) {
    return { ok: false, error: "ภาคเรียนต้นทางยังไม่มีชั้นเรียน" };
  }

  const supabase = await createClient();

  // source classroom id -> target classroom id (filled while creating structure)
  const targetClassroomBySource = new Map<string, string>();

  for (const grade of sourceGrades) {
    const { data: newGrade, error: gradeError } = await supabase
      .from("grade_levels")
      .insert({
        semester_id: targetSemesterId,
        academic_year_id: target.academic_year_id,
        name: grade.name,
        sort_order: grade.sort_order,
      })
      .select("id")
      .single();

    if (gradeError || !newGrade) {
      return { ok: false, error: "ไม่สามารถคัดลอกชั้นเรียนได้" };
    }

    const sourceClassrooms = await listClassroomsByGrade(grade.id);
    if (sourceClassrooms.length === 0) continue;

    const { data: insertedClassrooms, error: classroomError } = await supabase
      .from("classrooms")
      .insert(
        sourceClassrooms.map((classroom) => ({
          semester_id: targetSemesterId,
          academic_year_id: target.academic_year_id,
          grade_level_id: newGrade.id,
          name: classroom.name,
        })),
      )
      .select("id, name");

    if (classroomError || !insertedClassrooms) {
      return { ok: false, error: "ไม่สามารถคัดลอกห้องเรียนได้" };
    }

    // Classroom names are unique within a grade (classrooms_semester_grade_name_unique),
    // so matching source→target rooms by name within this grade is collision-free.
    const targetIdByName = new Map(insertedClassrooms.map((c) => [c.name, c.id]));
    for (const sourceClassroom of sourceClassrooms) {
      const targetId = targetIdByName.get(sourceClassroom.name);
      if (targetId) targetClassroomBySource.set(sourceClassroom.id, targetId);
    }
  }

  let enrolledCount = 0;

  if (includeStudents && targetClassroomBySource.size > 0) {
    const sourceClassroomIds = [...targetClassroomBySource.keys()];
    const { data: sourceEnrollments, error: enrollmentReadError } = await supabase
      .from("student_enrollments")
      .select("student_id, classroom_id")
      .eq("status", "enrolled")
      .in("classroom_id", sourceClassroomIds);

    if (enrollmentReadError) {
      return { ok: false, error: "ไม่สามารถอ่านรายชื่อนักเรียนต้นทางได้" };
    }

    const rows = buildCarryForwardEnrollments({
      sourceEnrollments: sourceEnrollments ?? [],
      targetClassroomBySource,
      targetSemesterId,
      targetAcademicYearId: target.academic_year_id,
    });

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("student_enrollments").insert(rows);
      if (insertError) {
        // โครงสร้างถูกสร้างไปแล้ว แต่การลงทะเบียนล้มเหลว — แจ้งให้ชัดเพื่อให้แอดมินเพิ่มนักเรียนเองได้
        revalidateRegistrationPaths();
        return {
          ok: false,
          error: "คัดลอกโครงสร้างแล้ว แต่ลงทะเบียนนักเรียนไม่สำเร็จ — กรุณาเพิ่มนักเรียนในห้องด้วยตนเอง",
        };
      }
      enrolledCount = rows.length;
    }
  }

  revalidateRegistrationPaths();
  return { ok: true, enrolledCount };
}
