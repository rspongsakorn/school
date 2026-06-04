import { formatStudentName } from "@/lib/format";
import {
  mapClassroomsByName,
  mapGradesByOrder,
  type GradeMapping,
} from "@/lib/promotion/mapping";
import { createClient } from "@/lib/supabase/server";

export type PromotionStudent = {
  studentId: string;
  studentCode: string;
  name: string;
  /** มี enrollment ในภาคปลายทางอยู่แล้ว -> จะถูกข้าม */
  alreadyInTarget: boolean;
};

export type PromotionClassroomPlan = {
  sourceClassroomId: string;
  sourceClassroomName: string;
  /** ห้องปลายทางที่จับคู่อัตโนมัติ (null = ต้องเลือกเอง) */
  defaultTargetClassroomId: string | null;
  students: PromotionStudent[];
};

export type PromotionTargetClassroom = {
  id: string;
  name: string;
};

export type PromotionGradePlan = {
  sourceGradeId: string;
  sourceGradeName: string;
  /** null = จบการศึกษา (ไม่มีชั้นถัดไป) */
  defaultTargetGradeId: string | null;
  classrooms: PromotionClassroomPlan[];
};

export type PromotionTargetGrade = {
  id: string;
  name: string;
  sortOrder: number;
  classrooms: PromotionTargetClassroom[];
};

export type PromotionPlan = {
  grades: PromotionGradePlan[];
  /** ชั้นปลายทางทั้งหมด (ให้ UI ใช้ทำ dropdown แก้ mapping) */
  targetGrades: PromotionTargetGrade[];
};

type GradeRow = { id: string; name: string; sort_order: number };
type ClassroomRow = { id: string; name: string; grade_level_id: string };
type EnrollmentRow = {
  classroom_id: string;
  students: {
    id: string;
    student_code: string;
    first_name: string;
    last_name: string;
  } | null;
};

export async function buildPromotionPlan(
  sourceSemesterId: string,
  targetSemesterId: string,
): Promise<PromotionPlan> {
  const supabase = await createClient();

  const [sourceGradesRes, targetGradesRes] = await Promise.all([
    supabase
      .from("grade_levels")
      .select("id, name, sort_order")
      .eq("semester_id", sourceSemesterId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("grade_levels")
      .select("id, name, sort_order")
      .eq("semester_id", targetSemesterId)
      .order("sort_order", { ascending: true }),
  ]);

  const sourceGrades = (sourceGradesRes.data ?? []) as GradeRow[];
  const targetGrades = (targetGradesRes.data ?? []) as GradeRow[];

  const [sourceClassroomsRes, targetClassroomsRes] = await Promise.all([
    supabase
      .from("classrooms")
      .select("id, name, grade_level_id")
      .eq("semester_id", sourceSemesterId)
      .order("name", { ascending: true }),
    supabase
      .from("classrooms")
      .select("id, name, grade_level_id")
      .eq("semester_id", targetSemesterId)
      .order("name", { ascending: true }),
  ]);

  const sourceClassrooms = (sourceClassroomsRes.data ?? []) as ClassroomRow[];
  const targetClassrooms = (targetClassroomsRes.data ?? []) as ClassroomRow[];

  // นักเรียนที่กำลังเรียนในภาคต้นทาง (ต่อห้อง)
  const { data: enrollmentData } = await supabase
    .from("student_enrollments")
    .select(
      `classroom_id, students ( id, student_code, first_name, last_name )`,
    )
    .eq("semester_id", sourceSemesterId)
    .eq("status", "enrolled");
  const enrollments = (enrollmentData ?? []) as unknown as EnrollmentRow[];

  // นักเรียนที่มี enrollment ในภาคปลายทางแล้ว
  const { data: targetEnrollData } = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("semester_id", targetSemesterId);
  const alreadyInTarget = new Set((targetEnrollData ?? []).map((row) => row.student_id));

  // group students by source classroom
  const studentsByClassroom = new Map<string, PromotionStudent[]>();
  for (const row of enrollments) {
    if (!row.students) continue;
    const list = studentsByClassroom.get(row.classroom_id) ?? [];
    list.push({
      studentId: row.students.id,
      studentCode: row.students.student_code,
      name: formatStudentName(row.students.first_name, row.students.last_name),
      alreadyInTarget: alreadyInTarget.has(row.students.id),
    });
    studentsByClassroom.set(row.classroom_id, list);
  }

  const gradeMap: GradeMapping[] = mapGradesByOrder(
    sourceGrades.map((x) => ({ id: x.id, name: x.name, sortOrder: x.sort_order })),
    targetGrades.map((x) => ({ id: x.id, name: x.name, sortOrder: x.sort_order })),
  );
  const targetGradeIdBySource = new Map(
    gradeMap.map((m) => [m.sourceGradeId, m.targetGradeId]),
  );

  const targetClassroomsByGrade = new Map<string, ClassroomRow[]>();
  for (const room of targetClassrooms) {
    const list = targetClassroomsByGrade.get(room.grade_level_id) ?? [];
    list.push(room);
    targetClassroomsByGrade.set(room.grade_level_id, list);
  }

  const grades: PromotionGradePlan[] = sourceGrades.map((grade) => {
    const targetGradeId = targetGradeIdBySource.get(grade.id) ?? null;
    const targetRooms = targetGradeId
      ? (targetClassroomsByGrade.get(targetGradeId) ?? [])
      : [];
    const sourceRooms = sourceClassrooms.filter((r) => r.grade_level_id === grade.id);
    const classroomMap = mapClassroomsByName(
      sourceRooms.map((r) => ({ id: r.id, name: r.name })),
      targetRooms.map((r) => ({ id: r.id, name: r.name })),
    );
    const targetBySource = new Map(
      classroomMap.map((m) => [m.sourceClassroomId, m.targetClassroomId]),
    );

    return {
      sourceGradeId: grade.id,
      sourceGradeName: grade.name,
      defaultTargetGradeId: targetGradeId,
      classrooms: sourceRooms.map((room) => ({
        sourceClassroomId: room.id,
        sourceClassroomName: room.name,
        defaultTargetClassroomId: targetBySource.get(room.id) ?? null,
        students: studentsByClassroom.get(room.id) ?? [],
      })),
    };
  });

  const targetGradesOut: PromotionTargetGrade[] = targetGrades.map((grade) => ({
    id: grade.id,
    name: grade.name,
    sortOrder: grade.sort_order,
    classrooms: (targetClassroomsByGrade.get(grade.id) ?? []).map((r) => ({
      id: r.id,
      name: r.name,
    })),
  }));

  return { grades, targetGrades: targetGradesOut };
}
