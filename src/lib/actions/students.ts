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

export async function confirmStudentCsvImport(
  rows: ImportStudentRow[],
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

    const supabase = await createClient();
    const inserts = ready.map((row) => ({
      student_code: row.studentCode,
      first_name: row.firstName,
      last_name: row.lastName,
      gender: row.gender,
      date_of_birth: row.dateOfBirth,
      id_card: row.idCard,
      status: "active" as const,
    }));

    for (let offset = 0; offset < inserts.length; offset += INSERT_CHUNK_SIZE) {
      const chunk = inserts.slice(offset, offset + INSERT_CHUNK_SIZE);
      const { error } = await supabase.from("students").insert(chunk);
      if (error) {
        return { ok: false, error: "ไม่สามารถนำเข้านักเรียนได้" };
      }
    }

    revalidatePath("/students");
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
  "ไม่สามารถลบได้ — มีประวัติการลงทะเบียน ใบแจ้งชำระ หรือใบเสร็จที่ยังไม่ยกเลิก กรุณาจัดการก่อน";

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

async function deleteStudentRecord(studentId: string): Promise<ActionState> {
  const counts = await getStudentReferenceCounts(studentId);
  if (!isStudentDeletable(counts)) {
    return { ok: false, error: STUDENT_DELETE_BLOCKED_MESSAGE };
  }

  const supabase = await createClient();
  const cleanup = await deleteVoidedPaymentsForStudent(supabase, studentId);
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
  const [enrollments, invoices, activePayments] = await Promise.all([
    supabase.from("student_enrollments").select("student_id").in("student_id", uniqueIds),
    supabase.from("student_invoices").select("student_id").in("student_id", uniqueIds),
    supabase
      .from("payments")
      .select("student_id")
      .in("student_id", uniqueIds)
      .eq("status", "active"),
  ]);

  const blockedIds = new Set<string>();
  for (const row of enrollments.data ?? []) blockedIds.add(row.student_id);
  for (const row of invoices.data ?? []) blockedIds.add(row.student_id);
  for (const row of activePayments.data ?? []) blockedIds.add(row.student_id);

  const deletableIds = uniqueIds.filter((id) => !blockedIds.has(id));
  const skipped = uniqueIds.length - deletableIds.length;

  if (deletableIds.length === 0) {
    return {
      ok: false,
      error: "ไม่สามารถลบได้ — นักเรียนที่เลือกมีประวัติการลงทะเบียนหรือการเงิน",
    };
  }

  for (const studentId of deletableIds) {
    const cleanup = await deleteVoidedPaymentsForStudent(supabase, studentId);
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
