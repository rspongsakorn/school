"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { listClassroomsByGrade } from "@/lib/data/classrooms";
import { getSemesterById, getSemesterByYearAndNumber } from "@/lib/data/semesters";
import { createClient } from "@/lib/supabase/server";

function revalidateRegistrationPaths() {
  revalidatePath("/registration");
  revalidatePath("/students");
}

export async function copySemesterStructure(targetSemesterId: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const target = await getSemesterById(targetSemesterId);
  if (!target) return { ok: false, error: "ไม่พบภาคเรียน" };
  if (target.number !== 2) {
    return { ok: false, error: "คัดลอกได้เฉพาะไปยังภาคเรียนที่ 2" };
  }

  const existingGrades = await listGradeLevels(targetSemesterId);
  if (existingGrades.length > 0) {
    return { ok: false, error: "ภาคเรียนนี้มีชั้นเรียนอยู่แล้ว" };
  }

  const source = await getSemesterByYearAndNumber(target.academic_year_id, 1);
  if (!source) return { ok: false, error: "ไม่พบภาคเรียนที่ 1 ของปีนี้" };

  const sourceGrades = await listGradeLevels(source.id);
  if (sourceGrades.length === 0) {
    return { ok: false, error: "ภาคเรียนที่ 1 ยังไม่มีชั้นเรียน" };
  }

  const supabase = await createClient();

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

    const { error: classroomError } = await supabase.from("classrooms").insert(
      sourceClassrooms.map((classroom) => ({
        semester_id: targetSemesterId,
        academic_year_id: target.academic_year_id,
        grade_level_id: newGrade.id,
        name: classroom.name,
      })),
    );

    if (classroomError) {
      return { ok: false, error: "ไม่สามารถคัดลอกห้องเรียนได้" };
    }
  }

  revalidateRegistrationPaths();
  return { ok: true };
}
