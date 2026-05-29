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
import {
  importRowToCsvInput,
  validateAndBuildImportRows,
  type CsvStudentInputRow,
  type ImportRowError,
  type ImportStudentRow,
} from "@/lib/students/csv-import";
import { CSV_IMPORT_MAX_ROWS } from "@/lib/students/csv-format";
import { STUDENT_GENDER_LABELS } from "@/lib/students/constants";
import { formatThaiBirthDate } from "@/lib/students/dates";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ImportNewClassroom = {
  gradeName: string;
  number: string;
  gradeIsNew: boolean;
};

export type PreviewStudentCsvImportResult =
  | { ok: false; error: string }
  | {
      ok: true;
      stats: {
        ready: number;
        errors: number;
        willEnroll: number;
        willCreateGrades: number;
        willCreateClassrooms: number;
      };
      ready: ImportStudentRow[];
      preview: ImportStudentPreview[];
      errors: ImportRowError[];
      newGradeLevels: { name: string }[];
      newClassrooms: ImportNewClassroom[];
    };

export type ImportStudentPreview = {
  studentCode: string;
  idCard: string | null;
  name: string;
  genderLabel: string;
  birthDateLabel: string;
  classroomLabel: string | null;
};

export type ConfirmStudentCsvImportResult =
  | { ok: false; error: string }
  | { ok: true; imported: number; errors: ImportRowError[] };

const INSERT_CHUNK_SIZE = 100;

async function loadExistingStudentCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();

  const supabase = await createClient();
  const uniqueCodes = [...new Set(codes)];
  const { data, error } = await supabase
    .from("students")
    .select("student_code")
    .in("student_code", uniqueCodes);

  if (error) throw new Error("load_existing_codes_failed");

  return new Set((data ?? []).map((row) => row.student_code));
}

export async function previewStudentCsvImport(
  rows: CsvStudentInputRow[],
  semesterId: string | null,
): Promise<PreviewStudentCsvImportResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  if (rows.length > CSV_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `ไฟล์มีมากกว่า ${CSV_IMPORT_MAX_ROWS} แถว — กรุณาแบ่งไฟล์`,
    };
  }

  try {
    const codes = rows.map((row) => row.student_code?.trim()).filter(Boolean) as string[];
    const existingSet = await loadExistingStudentCodes(codes);
    const { ready, errors } = validateAndBuildImportRows(rows, existingSet);

    const rowsWithClassroom = ready.filter((r) => r.classroom != null);
    if (rowsWithClassroom.length > 0 && !semesterId) {
      return {
        ok: false,
        error: "ต้องตั้งภาคเรียนปัจจุบันก่อนใช้คอลัมน์ classroom",
      };
    }

    const supabase = await createClient();

    const existingGradeMap = new Map<string, string>(); // name -> id
    const existingClassroomMap = new Map<string, string>(); // gradeName|number -> id

    if (semesterId) {
      const { data: gradeRows } = await supabase
        .from("grade_levels")
        .select("id, name")
        .eq("semester_id", semesterId);
      for (const row of gradeRows ?? []) {
        existingGradeMap.set(row.name, row.id);
      }

      if (existingGradeMap.size > 0) {
        const gradeIds = [...existingGradeMap.values()];
        const { data: classroomRows } = await supabase
          .from("classrooms")
          .select("id, name, grade_level_id")
          .in("grade_level_id", gradeIds);
        const gradeIdToName = new Map<string, string>();
        for (const [name, id] of existingGradeMap) gradeIdToName.set(id, name);
        for (const row of classroomRows ?? []) {
          const gradeName = gradeIdToName.get(row.grade_level_id);
          if (!gradeName) continue;
          existingClassroomMap.set(`${gradeName}|${row.name}`, row.id);
        }
      }
    }

    const newGradeSet = new Set<string>();
    const newClassroomMap = new Map<string, ImportNewClassroom>();

    for (const row of rowsWithClassroom) {
      if (!row.classroom) continue;
      const { gradeName, classroomNumber } = row.classroom;
      const gradeIsNew = !existingGradeMap.has(gradeName);
      if (gradeIsNew) newGradeSet.add(gradeName);

      const key = `${gradeName}|${classroomNumber}`;
      if (!existingClassroomMap.has(key) && !newClassroomMap.has(key)) {
        newClassroomMap.set(key, {
          gradeName,
          number: classroomNumber,
          gradeIsNew,
        });
      }
    }

    const newGradeLevels = [...newGradeSet].map((name) => ({ name }));
    const newClassrooms = [...newClassroomMap.values()];

    const preview: ImportStudentPreview[] = ready.map((row) => ({
      studentCode: row.studentCode,
      idCard: row.idCard,
      name: `${row.firstName} ${row.lastName}`,
      genderLabel: STUDENT_GENDER_LABELS[row.gender],
      birthDateLabel: formatThaiBirthDate(row.dateOfBirth),
      classroomLabel: row.classroom
        ? `${row.classroom.gradeName}/${row.classroom.classroomNumber}`
        : null,
    }));

    return {
      ok: true,
      stats: {
        ready: ready.length,
        errors: errors.length,
        willEnroll: rowsWithClassroom.length,
        willCreateGrades: newGradeLevels.length,
        willCreateClassrooms: newClassrooms.length,
      },
      ready,
      preview,
      errors,
      newGradeLevels,
      newClassrooms,
    };
  } catch {
    return { ok: false, error: "ไม่สามารถตรวจสอบไฟล์ได้" };
  }
}

async function getSemesterAcademicYearId(
  supabase: SupabaseClient,
  semesterId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("semesters")
    .select("academic_year_id")
    .eq("id", semesterId)
    .maybeSingle();
  return data?.academic_year_id ?? null;
}

export async function confirmStudentCsvImport(
  rows: ImportStudentRow[],
  semesterId: string | null,
): Promise<ConfirmStudentCsvImportResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  if (rows.length === 0) {
    return { ok: true, imported: 0, errors: [] };
  }

  if (rows.length > CSV_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `นำเข้าได้สูงสุด ${CSV_IMPORT_MAX_ROWS} แถวต่อครั้ง`,
    };
  }

  try {
    const mappedRows = rows.map((row, index) => importRowToCsvInput(row, index + 2));
    const codes = mappedRows.map((row) => row.student_code?.trim()).filter(Boolean) as string[];
    const existingSet = await loadExistingStudentCodes(codes);
    const { ready, errors } = validateAndBuildImportRows(mappedRows, existingSet);

    if (ready.length === 0) {
      return { ok: true, imported: 0, errors };
    }

    const rowsWithClassroom = ready.filter((r) => r.classroom != null);
    if (rowsWithClassroom.length > 0 && !semesterId) {
      return {
        ok: false,
        error: "ต้องตั้งภาคเรียนปัจจุบันก่อนใช้คอลัมน์ classroom",
      };
    }

    const supabase = await createClient();

    // Step A — ensure grade_levels exist
    const gradeNameToId = new Map<string, string>();
    let academicYearId: string | null = null;

    if (semesterId && rowsWithClassroom.length > 0) {
      academicYearId = await getSemesterAcademicYearId(supabase, semesterId);
      if (!academicYearId) {
        return { ok: false, error: "ไม่พบภาคเรียน" };
      }

      const { data: existingGrades } = await supabase
        .from("grade_levels")
        .select("id, name")
        .eq("semester_id", semesterId);
      for (const row of existingGrades ?? []) {
        gradeNameToId.set(row.name, row.id);
      }

      const missingGradeNames = new Set<string>();
      for (const row of rowsWithClassroom) {
        if (row.classroom && !gradeNameToId.has(row.classroom.gradeName)) {
          missingGradeNames.add(row.classroom.gradeName);
        }
      }

      if (missingGradeNames.size > 0) {
        const inserts = [...missingGradeNames].map((name) => ({
          semester_id: semesterId,
          academic_year_id: academicYearId!,
          name,
          sort_order: 0,
        }));
        const { error: gradeError } = await supabase
          .from("grade_levels")
          .upsert(inserts, {
            onConflict: "semester_id,name",
            ignoreDuplicates: true,
          });
        if (gradeError) {
          return { ok: false, error: "ไม่สามารถสร้างชั้นเรียนได้" };
        }

        const { data: refreshedGrades } = await supabase
          .from("grade_levels")
          .select("id, name")
          .eq("semester_id", semesterId);
        gradeNameToId.clear();
        for (const row of refreshedGrades ?? []) {
          gradeNameToId.set(row.name, row.id);
        }
      }
    }

    // Step B — ensure classrooms exist
    const classroomKeyToId = new Map<string, string>(); // gradeName|number -> id

    if (semesterId && rowsWithClassroom.length > 0) {
      const gradeIds = [...gradeNameToId.values()];
      if (gradeIds.length > 0) {
        const { data: existingClassrooms } = await supabase
          .from("classrooms")
          .select("id, name, grade_level_id")
          .in("grade_level_id", gradeIds);
        const gradeIdToName = new Map<string, string>();
        for (const [name, id] of gradeNameToId) gradeIdToName.set(id, name);
        for (const row of existingClassrooms ?? []) {
          const gradeName = gradeIdToName.get(row.grade_level_id);
          if (!gradeName) continue;
          classroomKeyToId.set(`${gradeName}|${row.name}`, row.id);
        }
      }

      const missingClassroomEntries: Array<{
        gradeName: string;
        classroomNumber: string;
        gradeLevelId: string;
      }> = [];
      const seenMissing = new Set<string>();
      for (const row of rowsWithClassroom) {
        if (!row.classroom) continue;
        const key = `${row.classroom.gradeName}|${row.classroom.classroomNumber}`;
        if (classroomKeyToId.has(key) || seenMissing.has(key)) continue;
        const gradeLevelId = gradeNameToId.get(row.classroom.gradeName);
        if (!gradeLevelId) continue;
        missingClassroomEntries.push({
          gradeName: row.classroom.gradeName,
          classroomNumber: row.classroom.classroomNumber,
          gradeLevelId,
        });
        seenMissing.add(key);
      }

      if (missingClassroomEntries.length > 0) {
        const inserts = missingClassroomEntries.map((e) => ({
          semester_id: semesterId,
          academic_year_id: academicYearId!,
          grade_level_id: e.gradeLevelId,
          name: e.classroomNumber,
        }));
        const { error: classroomError } = await supabase
          .from("classrooms")
          .upsert(inserts, {
            onConflict: "semester_id,grade_level_id,name",
            ignoreDuplicates: true,
          });
        if (classroomError) {
          return { ok: false, error: "ไม่สามารถสร้างห้องเรียนได้" };
        }

        const gradeIds2 = [...gradeNameToId.values()];
        const { data: refreshedClassrooms } = await supabase
          .from("classrooms")
          .select("id, name, grade_level_id")
          .in("grade_level_id", gradeIds2);
        const gradeIdToName2 = new Map<string, string>();
        for (const [name, id] of gradeNameToId) gradeIdToName2.set(id, name);
        classroomKeyToId.clear();
        for (const row of refreshedClassrooms ?? []) {
          const gradeName = gradeIdToName2.get(row.grade_level_id);
          if (!gradeName) continue;
          classroomKeyToId.set(`${gradeName}|${row.name}`, row.id);
        }
      }
    }

    // Step C — insert students (chunked) and collect ids
    const inserts = ready.map((row) => ({
      student_code: row.studentCode,
      first_name: row.firstName,
      last_name: row.lastName,
      gender: row.gender,
      date_of_birth: row.dateOfBirth,
      id_card: row.idCard,
      status: "active" as const,
    }));

    const studentCodeToId = new Map<string, string>();
    for (let offset = 0; offset < inserts.length; offset += INSERT_CHUNK_SIZE) {
      const chunk = inserts.slice(offset, offset + INSERT_CHUNK_SIZE);
      const { data, error } = await supabase
        .from("students")
        .insert(chunk)
        .select("id, student_code");
      if (error || !data) {
        return { ok: false, error: "ไม่สามารถนำเข้านักเรียนได้" };
      }
      for (const row of data) {
        studentCodeToId.set(row.student_code, row.id);
      }
    }

    // Step D — insert student_enrollments for rows that carry classroom
    if (semesterId && rowsWithClassroom.length > 0) {
      const enrollmentInserts: Array<{
        student_id: string;
        classroom_id: string;
        academic_year_id: string;
        semester_id: string;
        status: "enrolled";
      }> = [];
      for (const row of rowsWithClassroom) {
        if (!row.classroom) continue;
        const studentId = studentCodeToId.get(row.studentCode);
        if (!studentId) continue;
        const classroomId = classroomKeyToId.get(
          `${row.classroom.gradeName}|${row.classroom.classroomNumber}`,
        );
        if (!classroomId) continue;
        enrollmentInserts.push({
          student_id: studentId,
          classroom_id: classroomId,
          academic_year_id: academicYearId!,
          semester_id: semesterId,
          status: "enrolled",
        });
      }

      for (let offset = 0; offset < enrollmentInserts.length; offset += INSERT_CHUNK_SIZE) {
        const chunk = enrollmentInserts.slice(offset, offset + INSERT_CHUNK_SIZE);
        const { error } = await supabase.from("student_enrollments").insert(chunk);
        if (error) {
          return {
            ok: false,
            error: "นำเข้านักเรียนสำเร็จ แต่ลงทะเบียนเข้าห้องไม่สำเร็จ กรุณาลงทะเบียนเองในหน้า registration",
          };
        }
      }
    }

    revalidatePath("/students");
    revalidatePath("/registration");
    return { ok: true, imported: ready.length, errors };
  } catch {
    return { ok: false, error: "ไม่สามารถนำเข้านักเรียนได้" };
  }
}

export async function createStudent(input: StudentFormInput): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validation = validateStudentForm(input, { mode: "create" });
  if (!validation.ok) {
    return { ok: false, error: firstStudentFormError(validation.errors) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("students").insert({
    student_code: input.studentCode.trim(),
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    id_card: input.idCard.trim() || null,
    gender: input.gender || null,
    date_of_birth: input.dateOfBirth.trim() || null,
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

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("students")
    .select("gender, date_of_birth")
    .eq("id", id)
    .single();

  const validation = validateStudentForm(input, {
    mode: "update",
    existing: {
      gender: existing?.gender ?? null,
      dateOfBirth: existing?.date_of_birth ?? null,
    },
  });
  if (!validation.ok) {
    return { ok: false, error: firstStudentFormError(validation.errors) };
  }

  const { error } = await supabase
    .from("students")
    .update({
      student_code: input.studentCode.trim(),
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      id_card: input.idCard.trim() || null,
      gender: input.gender || null,
      date_of_birth: input.dateOfBirth.trim() || null,
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
  "ไม่สามารถลบได้ — นักเรียนยังลงทะเบียนในห้อง หรือมีใบเสร็จที่ยังไม่ยกเลิก กรุณาจัดการก่อน";

async function deleteVoidedPaymentsForStudent(
  supabase: SupabaseClient,
  studentId: string,
): Promise<ActionState> {
  const { data: voidedPayments, error: fetchError } = await supabase
    .from("payments")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "voided");

  if (fetchError) return { ok: false, error: "ไม่สามารถเตรียมลบประวัติการชำระได้" };

  const paymentIds = (voidedPayments ?? []).map((row) => row.id);
  if (paymentIds.length === 0) return { ok: true };

  const { error: allocError } = await supabase
    .from("payment_allocations")
    .delete()
    .in("payment_id", paymentIds);
  if (allocError) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };

  const { error: voidError } = await supabase
    .from("payment_voids")
    .delete()
    .in("payment_id", paymentIds);
  if (voidError) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };

  const { error: receiptError } = await supabase
    .from("receipts")
    .delete()
    .in("payment_id", paymentIds);
  if (receiptError) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };

  const { error: paymentError } = await supabase.from("payments").delete().in("id", paymentIds);
  if (paymentError) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };

  return { ok: true };
}

async function deleteStudentDependents(
  supabase: SupabaseClient,
  studentId: string,
): Promise<ActionState> {
  // Voided payments + their allocations, voids, receipts
  const paymentsCleanup = await deleteVoidedPaymentsForStudent(supabase, studentId);
  if (!paymentsCleanup.ok) return paymentsCleanup;

  // Invoices (invoice_lines cascade via ON DELETE CASCADE)
  const { error: invoiceError } = await supabase
    .from("student_invoices")
    .delete()
    .eq("student_id", studentId);
  if (invoiceError) {
    return { ok: false, error: "ไม่สามารถลบใบแจ้งชำระของนักเรียนได้" };
  }

  // Enrollments
  const { error: enrollmentError } = await supabase
    .from("student_enrollments")
    .delete()
    .eq("student_id", studentId);
  if (enrollmentError) {
    return { ok: false, error: "ไม่สามารถลบการลงทะเบียนของนักเรียนได้" };
  }

  return { ok: true };
}

async function deleteStudentRecord(studentId: string): Promise<ActionState> {
  const counts = await getStudentReferenceCounts(studentId);
  if (!isStudentDeletable(counts)) {
    return { ok: false, error: STUDENT_DELETE_BLOCKED_MESSAGE };
  }

  const supabase = await createClient();
  const cleanup = await deleteStudentDependents(supabase, studentId);
  if (!cleanup.ok) return cleanup;

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
  const [activeEnrollments, activePayments] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("student_id")
      .in("student_id", uniqueIds)
      .eq("status", "enrolled"),
    supabase
      .from("payments")
      .select("student_id")
      .in("student_id", uniqueIds)
      .eq("status", "active"),
  ]);

  const blockedIds = new Set<string>();
  for (const row of activeEnrollments.data ?? []) blockedIds.add(row.student_id);
  for (const row of activePayments.data ?? []) blockedIds.add(row.student_id);

  const deletableIds = uniqueIds.filter((id) => !blockedIds.has(id));
  const skipped = uniqueIds.length - deletableIds.length;

  if (deletableIds.length === 0) {
    return {
      ok: false,
      error: "ไม่สามารถลบได้ — นักเรียนยังลงทะเบียนในห้อง หรือมีใบเสร็จที่ยังไม่ยกเลิก",
    };
  }

  for (const studentId of deletableIds) {
    const cleanup = await deleteStudentDependents(supabase, studentId);
    if (!cleanup.ok) return cleanup;

    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) {
      return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };
    }
  }

  revalidatePath("/students");
  revalidatePath("/registration");
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/reports/outstanding");
  revalidatePath("/reports/collections");
  return { ok: true, deleted: deletableIds.length, skipped };
}

export async function deleteAllStudents(): Promise<DeleteStudentsResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { data: allStudents, error: fetchError } = await supabase
    .from("students")
    .select("id")
    .limit(10000);

  if (fetchError) return { ok: false, error: "ไม่สามารถดึงข้อมูลนักเรียนได้" };

  const allIds = (allStudents ?? []).map((s) => s.id);

  // No students in the system — success with zero counts (unlike deleteStudents which rejects empty input)
  if (allIds.length === 0) {
    return { ok: true, deleted: 0, skipped: 0 };
  }

  const [activeEnrollments, activePayments] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("student_id")
      .in("student_id", allIds)
      .eq("status", "enrolled"),
    supabase
      .from("payments")
      .select("student_id")
      .in("student_id", allIds)
      .eq("status", "active"),
  ]);

  const blockedIds = new Set<string>();
  for (const row of activeEnrollments.data ?? []) blockedIds.add(row.student_id);
  for (const row of activePayments.data ?? []) blockedIds.add(row.student_id);

  const deletableIds = allIds.filter((id) => !blockedIds.has(id));
  const skipped = allIds.length - deletableIds.length;

  for (const studentId of deletableIds) {
    const cleanup = await deleteStudentDependents(supabase, studentId);
    if (!cleanup.ok) return cleanup;

    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };
  }

  // Partial success: skip students with active enrollments or payments (same condition as deleteStudents)
  // Unlike deleteStudents, we do NOT fail when deletableIds is empty — caller handles the skipped count
  revalidatePath("/students");
  revalidatePath("/registration");
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/reports/outstanding");
  revalidatePath("/reports/collections");
  return { ok: true, deleted: deletableIds.length, skipped };
}
