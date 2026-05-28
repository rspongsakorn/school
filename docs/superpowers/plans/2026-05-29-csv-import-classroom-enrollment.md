# CSV Import — Auto-Create Classroom + Enroll Student Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มคอลัมน์ `classroom` (optional) ใน student CSV import — parse "ชั้น/เลขห้อง" แล้ว auto-create grade_levels + classrooms ที่ขาดในภาคเรียนปัจจุบัน + enroll นักเรียนเข้าห้องในขั้นตอนเดียว

**Architecture:** Logic การ parse classroom รวมศูนย์ในฟังก์ชัน pure `parseClassroomCell` (ทดสอบ TDD) เพื่อใช้ซ้ำได้ ส่วน I/O แบ่งเป็น preview (อ่านอย่างเดียว + จำลอง) กับ confirm (เขียน DB เป็นลำดับ 4 ขั้น: upsert grades → upsert classrooms → insert students → insert enrollments) สำหรับ backward compatibility ไฟล์ CSV ที่ไม่มี classroom column ใช้ได้ตามเดิมทุกประการ

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (PostgreSQL) · React Query · Vitest

**Spec:** [docs/superpowers/specs/2026-05-29-csv-import-classroom-enrollment-design.md](../specs/2026-05-29-csv-import-classroom-enrollment-design.md)

---

## File Map

**Modify:**
- `src/lib/students/csv-format.ts` — เพิ่มแถวใน `CSV_FORMAT_TABLE`, อัปเดต `SAMPLE_CSV_CONTENT`
- `src/lib/students/csv-import.ts` — เพิ่ม `parseClassroomCell` helper + ขยาย `CsvStudentInputRow`, `csvRowsToObjects`, `ImportStudentRow`, `importRowToCsvInput`, `validateAndBuildImportRows`
- `src/lib/students/csv-import.test.ts` — เพิ่ม tests ครอบคลุม classroom parsing + classroom propagation
- `src/lib/actions/students.ts` — ขยาย `previewStudentCsvImport` (รับ `semesterId`, return ข้อมูล new grades/classrooms) และ `confirmStudentCsvImport` (auto-create + enroll)
- `src/components/students/student-import-dialog.tsx` — รับ `semesterId` + `semesterLabel`, render preview section ใหม่, render classroom column
- `src/components/students/students-panel.tsx` — ส่ง `semesterId` + `semesterLabel` ลง dialog

**No new files.**

---

## Phase 1: Pure Helper + Type Extensions

### Task 1: `parseClassroomCell` pure helper with TDD

**Files:**
- Modify: `src/lib/students/csv-import.ts` — เพิ่ม type + function
- Modify: `src/lib/students/csv-import.test.ts` — เพิ่ม tests

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/students/csv-import.test.ts`:

```ts
import { parseClassroomCell } from "@/lib/students/csv-import";

describe("parseClassroomCell", () => {
  it("returns empty for empty string", () => {
    expect(parseClassroomCell("")).toEqual({ ok: true, empty: true });
  });

  it("returns empty for whitespace only", () => {
    expect(parseClassroomCell("   ")).toEqual({ ok: true, empty: true });
  });

  it("splits ม.2/1 into grade and classroom number", () => {
    expect(parseClassroomCell("ม.2/1")).toEqual({
      ok: true,
      empty: false,
      gradeName: "ม.2",
      classroomNumber: "1",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseClassroomCell("  ม.2/1  ")).toEqual({
      ok: true,
      empty: false,
      gradeName: "ม.2",
      classroomNumber: "1",
    });
  });

  it("errors when no slash", () => {
    const r = parseClassroomCell("ม.2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ชั้น\/เลขห้อง/);
  });

  it("errors when grade is empty", () => {
    const r = parseClassroomCell("/1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ขาดชื่อชั้น/);
  });

  it("errors when classroom number is empty", () => {
    const r = parseClassroomCell("ม.2/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/เลขห้อง/);
  });

  it("errors when classroom number is non-numeric", () => {
    const r = parseClassroomCell("ม.2/abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/เลขห้อง/);
  });

  it("errors when classroom number out of range (0)", () => {
    const r = parseClassroomCell("ม.2/0");
    expect(r.ok).toBe(false);
  });

  it("errors when classroom number out of range (1000)", () => {
    const r = parseClassroomCell("ม.2/1000");
    expect(r.ok).toBe(false);
  });

  it("splits on first slash only", () => {
    const r = parseClassroomCell("ม.2/1/extra");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/เลขห้อง/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- csv-import`
Expected: FAIL with "parseClassroomCell is not exported"

- [ ] **Step 3: Implement helper**

Append to `src/lib/students/csv-import.ts`:

```ts
export type ParsedClassroom =
  | { ok: true; empty: true }
  | { ok: true; empty: false; gradeName: string; classroomNumber: string }
  | { ok: false; error: string };

export function parseClassroomCell(raw: string): ParsedClassroom {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, empty: true };

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex === -1) {
    return { ok: false, error: "ต้องระบุในรูปแบบ ชั้น/เลขห้อง" };
  }

  const gradeName = trimmed.slice(0, slashIndex).trim();
  const classroomNumber = trimmed.slice(slashIndex + 1).trim();

  if (!gradeName) return { ok: false, error: "ขาดชื่อชั้นเรียน" };

  if (!/^\d+$/.test(classroomNumber)) {
    return { ok: false, error: "เลขห้องต้องเป็นตัวเลข 1–999" };
  }
  const num = Number(classroomNumber);
  if (num < 1 || num > 999) {
    return { ok: false, error: "เลขห้องต้องเป็นตัวเลข 1–999" };
  }

  return { ok: true, empty: false, gradeName, classroomNumber };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- csv-import`
Expected: all green (existing tests + 11 new `parseClassroomCell` tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/students/csv-import.ts src/lib/students/csv-import.test.ts
git commit -m "feat(students): add parseClassroomCell helper with TDD"
```

---

### Task 2: Extend CSV row types + transforms to carry classroom

**Files:**
- Modify: `src/lib/students/csv-import.ts`
- Modify: `src/lib/students/csv-import.test.ts`

- [ ] **Step 1: Extend `CsvStudentInputRow`**

In `src/lib/students/csv-import.ts`, find the existing type and add `classroom?: string`:

```ts
export type CsvStudentInputRow = {
  rowNumber: number;
  id_card?: string;
  student_code?: string;
  gender?: string;
  first_name?: string;
  last_name?: string;
  birthdate?: string;
  classroom?: string;
};
```

- [ ] **Step 2: Extend `ImportStudentRow`**

Replace existing type:

```ts
export type ImportStudentRow = {
  studentCode: string;
  firstName: string;
  lastName: string;
  gender: StudentGender;
  dateOfBirth: string;
  idCard: string | null;
  classroom: { gradeName: string; classroomNumber: string } | null;
};
```

- [ ] **Step 3: Extend `csvRowsToObjects`**

Add a branch to pick up the new column. Replace the function with:

```ts
export function csvRowsToObjects(header: string[], dataRows: string[][]): CsvStudentInputRow[] {
  return dataRows.map((cells, index) => {
    const row: CsvStudentInputRow = { rowNumber: index + 2 };
    header.forEach((key, colIndex) => {
      if (key === "id_card") row.id_card = (cells[colIndex] ?? "").trim();
      else if (key === "student_code") row.student_code = (cells[colIndex] ?? "").trim();
      else if (key === "gender") row.gender = (cells[colIndex] ?? "").trim();
      else if (key === "first_name") row.first_name = (cells[colIndex] ?? "").trim();
      else if (key === "last_name") row.last_name = (cells[colIndex] ?? "").trim();
      else if (key === "birthdate") row.birthdate = (cells[colIndex] ?? "").trim();
      else if (key === "classroom") row.classroom = (cells[colIndex] ?? "").trim();
    });
    return row;
  });
}
```

- [ ] **Step 4: Extend `validateAndBuildImportRows`**

Replace the function so it parses classroom + propagates errors:

```ts
export function validateAndBuildImportRows(
  rows: CsvStudentInputRow[],
  existingCodes: Set<string>,
): { ready: ImportStudentRow[]; errors: ImportRowError[] } {
  const seenInFile = new Set<string>();
  const ready: ImportStudentRow[] = [];
  const errors: ImportRowError[] = [];

  for (const row of rows) {
    const code = row.student_code?.trim() ?? "";
    const firstName = row.first_name?.trim() ?? "";
    const lastName = row.last_name?.trim() ?? "";
    const genderLabel = row.gender?.trim() ?? "";
    const birthdate = row.birthdate?.trim() ?? "";
    const classroomRaw = row.classroom ?? "";

    const pushError = (message: string) => {
      errors.push({
        row: row.rowNumber,
        studentCode: code || undefined,
        message,
      });
    };

    if (!code || !firstName || !lastName || !genderLabel || !birthdate) {
      pushError("ข้อมูลไม่ครบ");
      continue;
    }

    if (existingCodes.has(code)) {
      pushError("รหัสนักเรียนนี้มีในระบบแล้ว");
      continue;
    }

    if (seenInFile.has(code)) {
      pushError("รหัสนักเรียนซ้ำในไฟล์ (แถวนี้)");
      continue;
    }

    const gender = mapGenderLabel(genderLabel);
    if (!gender) {
      pushError("ไม่รู้จักคำนำหน้า/เพศ");
      continue;
    }

    const dateOfBirth = parseThaiBirthdateShort(birthdate);
    if (!dateOfBirth) {
      pushError("รูปแบบวันเกิดไม่ถูกต้องหรือเป็นวันในอนาคต");
      continue;
    }

    const classroomParsed = parseClassroomCell(classroomRaw);
    if (!classroomParsed.ok) {
      pushError(`ห้องเรียน: ${classroomParsed.error}`);
      continue;
    }
    const classroom = classroomParsed.empty
      ? null
      : {
          gradeName: classroomParsed.gradeName,
          classroomNumber: classroomParsed.classroomNumber,
        };

    seenInFile.add(code);
    ready.push({
      studentCode: code,
      firstName,
      lastName,
      gender,
      dateOfBirth,
      idCard: row.id_card?.trim() || null,
      classroom,
    });
  }

  return { ready, errors };
}
```

- [ ] **Step 5: Extend `importRowToCsvInput` (round-trip safety)**

Replace:

```ts
export function importRowToCsvInput(row: ImportStudentRow, rowNumber: number): CsvStudentInputRow {
  return {
    rowNumber,
    student_code: row.studentCode,
    first_name: row.firstName,
    last_name: row.lastName,
    gender: row.gender === "male" ? "เด็กชาย" : "เด็กหญิง",
    birthdate: formatThaiBirthdateShort(row.dateOfBirth),
    id_card: row.idCard ?? "",
    classroom: row.classroom
      ? `${row.classroom.gradeName}/${row.classroom.classroomNumber}`
      : "",
  };
}
```

- [ ] **Step 6: Add tests for new behavior**

Append to `src/lib/students/csv-import.test.ts`, inside the existing `describe("validateAndBuildImportRows", ...)`:

```ts
it("captures valid classroom from row", () => {
  const result = validateAndBuildImportRows(
    [{ ...baseRow, classroom: "ม.2/1" }],
    new Set(),
  );
  expect(result.ready).toHaveLength(1);
  expect(result.ready[0].classroom).toEqual({
    gradeName: "ม.2",
    classroomNumber: "1",
  });
});

it("treats empty classroom as null", () => {
  const result = validateAndBuildImportRows(
    [{ ...baseRow, classroom: "" }],
    new Set(),
  );
  expect(result.ready[0].classroom).toBeNull();
});

it("treats omitted classroom field as null", () => {
  const result = validateAndBuildImportRows([baseRow], new Set());
  expect(result.ready[0].classroom).toBeNull();
});

it("errors on classroom parse failure", () => {
  const result = validateAndBuildImportRows(
    [{ ...baseRow, classroom: "ม.2" }],
    new Set(),
  );
  expect(result.ready).toHaveLength(0);
  expect(result.errors[0].message).toMatch(/ห้องเรียน/);
});

it("re-validates classroom round-trip via importRowToCsvInput", () => {
  const row: ImportStudentRow = {
    studentCode: "12390",
    firstName: "ทดสอบ",
    lastName: "นามสกุล",
    gender: "male" as const,
    dateOfBirth: "2012-04-21",
    idCard: null,
    classroom: { gradeName: "ม.2", classroomNumber: "1" },
  };
  const csvRow = importRowToCsvInput(row, 2);
  expect(csvRow.classroom).toBe("ม.2/1");
  const result = validateAndBuildImportRows([csvRow], new Set());
  expect(result.ready[0].classroom).toEqual({
    gradeName: "ม.2",
    classroomNumber: "1",
  });
});
```

Also update the existing "builds ready row when valid" test to assert `classroom: null` on the result:

```ts
it("builds ready row when valid", () => {
  const result = validateAndBuildImportRows([baseRow], new Set());
  expect(result.ready).toHaveLength(1);
  expect(result.ready[0].studentCode).toBe("12390");
  expect(result.ready[0].classroom).toBeNull();
  expect(result.errors).toHaveLength(0);
});
```

Also update the existing "re-validates ImportStudentRow after importRowToCsvInput round-trip" — the existing test creates a `row` object without `classroom`. Add `classroom: null` to that object:

```ts
const row = {
  studentCode: "12390",
  firstName: "ทดสอบ",
  lastName: "นามสกุล",
  gender: "male" as const,
  dateOfBirth: "2012-04-21",
  idCard: null,
  classroom: null,
};
```

- [ ] **Step 7: Run tests**

Run: `npm test -- csv-import`
Expected: all tests pass (existing + new)

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only in `src/lib/actions/students.ts` (consumer not yet updated — fixed Task 4 and 5) and possibly the dialog (Task 6). Not in csv-import.ts itself.

- [ ] **Step 9: Commit**

```bash
git add src/lib/students/csv-import.ts src/lib/students/csv-import.test.ts
git commit -m "feat(students): propagate classroom through CSV import types"
```

---

### Task 3: Update CSV format table + sample CSV

**Files:**
- Modify: `src/lib/students/csv-format.ts`

- [ ] **Step 1: Add new entry to `CSV_FORMAT_TABLE`**

Append after the existing `id_card` entry (so the list ends with `id_card`, then `classroom`):

```ts
  {
    key: "classroom",
    description: "ห้องเรียน — ชั้น/เลขห้อง (ไม่บังคับ; ถ้าระบุจะลงทะเบียนให้อัตโนมัติ)",
    example: "ม.2/1",
  },
```

- [ ] **Step 2: Update `SAMPLE_CSV_CONTENT`**

Replace the existing constant:

```ts
export const SAMPLE_CSV_CONTENT = [
  "id_card,student_code,gender,first_name,last_name,birthdate,classroom",
  '1101000391474,12390,เด็กหญิง,สุพิชชานันท์,เจิมกลาง,"21 เม.ย. 55",ม.2/1',
  ',12391,เด็กชาย,สมชาย,ทดสอบ,"15 พ.ค. 55",',
].join("\n");
```

- [ ] **Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: no new errors in `csv-format.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/students/csv-format.ts
git commit -m "feat(students): document classroom column in CSV format"
```

---

## Phase 2: Server Actions

### Task 4: Extend `previewStudentCsvImport`

**Files:**
- Modify: `src/lib/actions/students.ts`

This task adds `semesterId` to the input, computes new grades/classrooms, and returns them in the result. NO DB writes yet.

- [ ] **Step 1: Update result types**

Replace the existing `PreviewStudentCsvImportResult` type:

```ts
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
```

Replace the existing `ImportStudentPreview` type:

```ts
export type ImportStudentPreview = {
  studentCode: string;
  idCard: string | null;
  name: string;
  genderLabel: string;
  birthDateLabel: string;
  classroomLabel: string | null;
};
```

- [ ] **Step 2: Replace `previewStudentCsvImport`**

Replace the entire function:

```ts
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in `student-import-dialog.tsx` (caller) — to be fixed Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/students.ts
git commit -m "feat(students): preview classrooms to create + enroll in CSV import"
```

---

### Task 5: Extend `confirmStudentCsvImport` to auto-create + enroll

**Files:**
- Modify: `src/lib/actions/students.ts`

- [ ] **Step 1: Update result type**

Keep the existing `ConfirmStudentCsvImportResult` shape — no change needed. The function will still return `imported: number` (number of student records inserted) and `errors`.

- [ ] **Step 2: Add helper inside the file (above `confirmStudentCsvImport`)**

```ts
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
```

- [ ] **Step 3: Replace `confirmStudentCsvImport`**

```ts
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
            onConflict: "grade_level_id,name",
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
```

- [ ] **Step 4: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: remaining error only in `student-import-dialog.tsx` caller (Task 6). All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/students.ts
git commit -m "feat(students): auto-create classrooms and enroll on CSV confirm"
```

---

## Phase 3: UI

### Task 6: Update `StudentImportDialog`

**Files:**
- Modify: `src/components/students/student-import-dialog.tsx`

- [ ] **Step 1: Update props**

Replace `StudentImportDialogProps`:

```tsx
type StudentImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: string | null;
  semesterLabel: string | null;
};
```

Update the component signature line:

```tsx
export function StudentImportDialog({
  open,
  onOpenChange,
  semesterId,
  semesterLabel,
}: StudentImportDialogProps) {
```

- [ ] **Step 2: Update `ParsedState`**

```tsx
type ParsedState = {
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
  newClassrooms: { gradeName: string; number: string; gradeIsNew: boolean }[];
};
```

Update the `setParsed({...})` call inside `handleFileChange`:

```tsx
setParsed({
  stats: result.stats,
  ready: result.ready,
  preview: result.preview,
  errors: result.errors,
  newGradeLevels: result.newGradeLevels,
  newClassrooms: result.newClassrooms,
});
```

- [ ] **Step 3: Pass semesterId to actions**

Replace the `previewStudentCsvImport` call:

```tsx
const result: PreviewStudentCsvImportResult = await previewStudentCsvImport(rows, semesterId);
```

Replace the `confirmStudentCsvImport` call:

```tsx
const result = await confirmStudentCsvImport(parsed.ready, semesterId);
```

- [ ] **Step 4: Add target-semester notice in setup phase**

Inside the `phase === "setup"` block, ABOVE the format table, add:

```tsx
<div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
  {semesterId ? (
    <span>
      จะลงทะเบียนนักเรียนเข้าภาคเรียน:{" "}
      <span className="font-medium">{semesterLabel ?? "—"}</span>
    </span>
  ) : (
    <span className="text-amber-700">
      ยังไม่มีปีการศึกษา/ภาคเรียนปัจจุบัน — ใช้ได้แต่จะไม่ลงทะเบียนห้องเรียนให้
    </span>
  )}
</div>
```

- [ ] **Step 5: Add "ห้องเรียนที่จะสร้างใหม่" section to review phase**

Inside the `parsed ? ( ... )` block, AFTER the stats `<p>` and BEFORE the existing errors block, add:

```tsx
{parsed.newClassrooms.length > 0 ? (
  <div className="space-y-2">
    <h3 className="text-sm font-medium">
      ห้องเรียนที่จะสร้างใหม่ ({parsed.newClassrooms.length} ห้อง)
    </h3>
    <div className="max-h-40 overflow-y-auto rounded-md border">
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead>ชั้น</TableHead>
            <TableHead>ห้อง</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parsed.newClassrooms.map((c) => (
            <TableRow key={`${c.gradeName}-${c.number}`}>
              <TableCell>
                <span>{c.gradeName}</span>
                {c.gradeIsNew ? (
                  <span className="ml-2 rounded bg-sky-50 px-1 text-[10px] text-sky-700">
                    ใหม่
                  </span>
                ) : null}
              </TableCell>
              <TableCell>{c.number}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
) : null}
```

- [ ] **Step 6: Update stats line**

Replace the existing stats paragraph:

```tsx
<p className="text-sm text-muted-foreground">
  พร้อมนำเข้า {parsed.stats.ready} แถว
  {parsed.stats.willEnroll > 0 ? ` · ลงทะเบียน ${parsed.stats.willEnroll} คน` : ""}
  {parsed.stats.willCreateClassrooms > 0
    ? ` · สร้างห้องใหม่ ${parsed.stats.willCreateClassrooms} ห้อง`
    : ""}
  {parsed.stats.errors > 0 ? ` · มีข้อผิดพลาด ${parsed.stats.errors} แถว` : ""}
</p>
```

- [ ] **Step 7: Add "ห้องเรียน" column to preview table**

Find the preview `<TableHeader>` block and add a new `<TableHead>` at the end:

```tsx
<TableHeader>
  <TableRow>
    <TableHead>รหัส</TableHead>
    <TableHead>เลขประชาชน</TableHead>
    <TableHead>ชื่อ-นามสกุล</TableHead>
    <TableHead>เพศ</TableHead>
    <TableHead>วันเกิด</TableHead>
    <TableHead>ห้องเรียน</TableHead>
  </TableRow>
</TableHeader>
```

And add a `<TableCell>` at the end of each preview row:

```tsx
<TableRow key={row.studentCode}>
  <TableCell className="font-medium tabular-nums">{row.studentCode}</TableCell>
  <TableCell className="tabular-nums">{row.idCard ?? "—"}</TableCell>
  <TableCell>{row.name}</TableCell>
  <TableCell>{row.genderLabel}</TableCell>
  <TableCell>{row.birthDateLabel}</TableCell>
  <TableCell>{row.classroomLabel ?? "—"}</TableCell>
</TableRow>
```

- [ ] **Step 8: Type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: error only in students panel (caller, Task 7). Tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/students/student-import-dialog.tsx
git commit -m "feat(students): show new classrooms + enroll target in import dialog"
```

---

### Task 7: Wire `semesterId` from `StudentsPanel` to the dialog

**Files:**
- Modify: `src/components/students/students-panel.tsx`

- [ ] **Step 1: Locate where `<StudentImportDialog ... />` is rendered**

Search for `StudentImportDialog` usage in the file. Replace the JSX with:

```tsx
<StudentImportDialog
  open={importOpen}
  onOpenChange={setImportOpen}
  semesterId={ctx?.semesterId ?? null}
  semesterLabel={
    ctx ? `ภาคเรียนที่ ${ctx.semesterNumber}/${ctx.academicYearName}` : null
  }
/>
```

(The `importOpen` / `setImportOpen` state already exists in the panel — leave it unchanged.)

- [ ] **Step 2: Verify `ctx` shape**

The `useSemesterContext` hook returns `ctx` with `semesterId`, `semesterNumber`, `academicYearName` (used in other panels). No code changes needed beyond Step 1.

- [ ] **Step 3: Type-check + tests + lint**

Run: `npx tsc --noEmit && npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/components/students/students-panel.tsx
git commit -m "feat(students): pass semester context into import dialog"
```

---

## Phase 4: Verification

### Task 8: End-to-end manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Backward-compat test (no classroom column)**

1. Login as admin
2. Go to `/students` → "นำเข้าจาก CSV"
3. Download sample CSV — confirm new sample includes `classroom` column
4. Upload an OLD-style CSV (no `classroom` column) — confirm:
   - Preview shows "พร้อมนำเข้า N แถว" with NO enroll/create stats
   - "ห้องเรียน" column shows "—" for all rows
   - "ห้องเรียนที่จะสร้างใหม่" section does NOT appear
   - Confirm import → students added but no enrollments

- [ ] **Step 3: Auto-create + enroll test**

1. Prepare a CSV with `classroom = "ม.7/9"` (a grade + classroom guaranteed not to exist)
2. Upload — confirm preview shows:
   - "ลงทะเบียน 1 คน · สร้างห้องใหม่ 1 ห้อง"
   - "ห้องเรียนที่จะสร้างใหม่" section shows ม.7/9 with "ใหม่" badge on the grade
3. Confirm import
4. Go to `/registration` — confirm grade "ม.7" and classroom "9" now exist + the student is enrolled

- [ ] **Step 4: Reuse existing classroom**

1. Prepare a CSV with `classroom` set to an EXISTING grade+classroom for some students
2. Upload — confirm:
   - "ห้องเรียนที่จะสร้างใหม่" does NOT include the existing row
   - "ลงทะเบียน N คน · สร้างห้องใหม่ 0 ห้อง" stats
3. Confirm → existing students enrolled into existing classroom

- [ ] **Step 5: Row error test**

1. Prepare CSV with one row having `classroom = "abc"` (no slash)
2. Upload — confirm preview shows that row as an error with message containing "ห้องเรียน:"
3. Other valid rows still ready

- [ ] **Step 6: No semester guard**

1. Temporarily set the school to have no active semester (or use a fresh DB)
2. Upload a CSV that HAS `classroom` values — confirm import is blocked with the right error
3. Upload a CSV without `classroom` — confirm it still imports

- [ ] **Step 7: Run automated checks**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Expected: tsc green, tests green, lint has no new errors compared to main.

- [ ] **Step 8: Commit any final tweaks (if any)**

```bash
git add -A
git commit -m "chore: tidy up after manual E2E verification"
```

---

## Notes for the Engineer

- **TDD scope:** `parseClassroomCell` is the only fully isolated pure function — covered by 11 unit tests. The propagation through `validateAndBuildImportRows` adds 5 more tests. UI changes are verified by type-check + manual smoke.
- **Backward compatibility is a hard requirement.** Tests assert that rows without `classroom` get `classroom: null` and still import.
- **Race safety:** Both `grade_levels` and `classrooms` use `INSERT … ON CONFLICT DO NOTHING` (via Supabase `upsert(…, { ignoreDuplicates: true })`) — re-query after to capture both newly-inserted and pre-existing rows.
- **No multi-statement transaction.** If `student_enrollments` insert fails after students are already inserted, surface the partial state with a clear error message — students stay in DB but un-enrolled.
- **Do NOT touch:** existing `createStudent`, `updateStudent`, `deleteStudent`, `deleteStudents`. Only the two CSV actions.
- **Do NOT change** the existing `INSERT_CHUNK_SIZE` constant or `loadExistingStudentCodes` helper.
- **Tests file naming:** keep all test cases in `src/lib/students/csv-import.test.ts` — do not split.
