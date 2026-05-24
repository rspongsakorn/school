import { createClient } from "@/lib/supabase/server";

export type SemesterReferenceCounts = {
  gradeLevels: number;
  classrooms: number;
  enrollments: number;
  teacherAssignments: number;
  feeRates: number;
  invoices: number;
};

export type YearReferenceCounts = SemesterReferenceCounts & {
  isActive: boolean;
  payments: number;
};

export function semesterHasBlockingReferences(counts: SemesterReferenceCounts): boolean {
  return Object.values(counts).some((n) => n > 0);
}

export function yearHasBlockingReferences(counts: YearReferenceCounts): boolean {
  if (counts.isActive) return true;
  const { isActive: _isActive, payments, ...semesterLike } = counts;
  return payments > 0 || semesterHasBlockingReferences(semesterLike);
}

export function semesterDeleteBlockedMessage() {
  return "ไม่สามารถลบได้ — ภาคเรียนนี้มีข้อมูลในระบบแล้ว";
}

export function yearDeleteBlockedMessage(
  reason: "year_is_active" | "year_has_data",
): string {
  if (reason === "year_is_active") {
    return "ไม่สามารถลบได้ — ปีนี้กำลังใช้งานอยู่ กรุณาเปลี่ยนปีที่ใช้งานก่อน";
  }
  return "ไม่สามารถลบได้ — ปีการศึกษานี้มีข้อมูลในระบบแล้ว";
}

async function countRows(table: string, column: string, id: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, id);

  if (error) return 1;
  return count ?? 0;
}

export async function getSemesterReferenceCounts(
  semesterId: string,
): Promise<SemesterReferenceCounts> {
  const [gradeLevels, classrooms, enrollments, teacherAssignments, feeRates, invoices] =
    await Promise.all([
      countRows("grade_levels", "semester_id", semesterId),
      countRows("classrooms", "semester_id", semesterId),
      countRows("student_enrollments", "semester_id", semesterId),
      countRows("teacher_assignments", "semester_id", semesterId),
      countRows("fee_rates", "semester_id", semesterId),
      countRows("student_invoices", "semester_id", semesterId),
    ]);

  return { gradeLevels, classrooms, enrollments, teacherAssignments, feeRates, invoices };
}

export async function getYearReferenceCounts(yearId: string): Promise<YearReferenceCounts> {
  const supabase = await createClient();
  const { data: year } = await supabase
    .from("academic_years")
    .select("is_active")
    .eq("id", yearId)
    .maybeSingle();

  const [gradeLevels, classrooms, enrollments, teacherAssignments, feeRates, invoices, payments] =
    await Promise.all([
      countRows("grade_levels", "academic_year_id", yearId),
      countRows("classrooms", "academic_year_id", yearId),
      countRows("student_enrollments", "academic_year_id", yearId),
      countRows("teacher_assignments", "academic_year_id", yearId),
      countRows("fee_rates", "academic_year_id", yearId),
      countRows("student_invoices", "academic_year_id", yearId),
      countRows("payments", "academic_year_id", yearId),
    ]);

  return {
    isActive: year?.is_active ?? false,
    gradeLevels,
    classrooms,
    enrollments,
    teacherAssignments,
    feeRates,
    invoices,
    payments,
  };
}

export async function assertSemesterDeletable(semesterId: string) {
  const counts = await getSemesterReferenceCounts(semesterId);
  if (semesterHasBlockingReferences(counts)) {
    return { ok: false as const, reason: "semester_has_data" as const };
  }
  return { ok: true as const };
}

export async function assertAcademicYearDeletable(yearId: string) {
  const counts = await getYearReferenceCounts(yearId);
  if (counts.isActive) {
    return { ok: false as const, reason: "year_is_active" as const };
  }
  if (yearHasBlockingReferences(counts)) {
    return { ok: false as const, reason: "year_has_data" as const };
  }
  return { ok: true as const };
}
