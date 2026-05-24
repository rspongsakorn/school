# Student CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin can import students from CSV on `/students` with format guide, preview, per-row errors, and confirm insert.

**Architecture:** Client reads/parses CSV text; `previewStudentCsvImport` loads existing codes and validates via shared `csv-import.ts`; UI shows format table, errors, and 10-row preview; `confirmStudentCsvImport` re-validates and bulk-inserts with `status: active`.

**Tech Stack:** Next.js App Router, Supabase, Vitest, existing shadcn Dialog/Table/Button.

**React best practices (required before coding):** Read `vendor/react-best-practices/` per `.cursor/skills/react-best-practices/SKILL.md`.

**Spec:** [2026-05-24-student-csv-import-design.md](../specs/2026-05-24-student-csv-import-design.md)

---

## Shared types (used across tasks)

```ts
// src/lib/students/csv-import.ts
export type CsvStudentRow = Record<string, string>;

export type ImportStudentRow = {
  studentCode: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  dateOfBirth: string; // ISO YYYY-MM-DD
  idCard: string | null;
};

export type ImportRowError = {
  row: number; // 1-based data row (header = row 0)
  studentCode?: string;
  message: string;
};

export type ImportStudentPreview = {
  studentCode: string;
  name: string;
  genderLabel: string;
  birthDateLabel: string;
};
```

---

### Task 1: CSV format constants

**Files:**
- Create: `src/lib/students/csv-format.ts`

- [ ] **Step 1: Create format table and sample CSV**

```ts
export const CSV_IMPORT_MAX_ROWS = 500;

export const CSV_REQUIRED_HEADERS = [
  "student_code",
  "first_name",
  "last_name",
  "gender",
  "birthdate",
] as const;

export const CSV_FORMAT_TABLE = [
  { key: "student_code", description: "รหัสนักเรียน (ไม่ซ้ำในระบบ)", example: "12390" },
  { key: "first_name", description: "ชื่อ", example: "สุพิชชานันท์" },
  { key: "last_name", description: "นามสกุล", example: "เจิมกลาง" },
  { key: "gender", description: "เด็กชาย/เด็กหญิง (แมปเป็นเพศในระบบ)", example: "เด็กหญิง" },
  { key: "birthdate", description: "วันเกิด วัน เดือนย่อไทย ปี พ.ศ. 2 หลัก", example: "21 เม.ย. 55" },
  { key: "id_card", description: "เลขบัตรประชาชน (ไม่บังคับ)", example: "1101000391474" },
] as const;

export const SAMPLE_CSV_CONTENT = [
  "id_card,student_code,gender,first_name,last_name,birthdate",
  '1101000391474,12390,เด็กหญิง,สุพิชชานันท์,เจิมกลาง,"21 เม.ย. 55"',
].join("\n");
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/students/csv-format.ts
git commit -m "feat: student CSV import format constants"
```

---

### Task 2: CSV parse and validate (TDD)

**Files:**
- Create: `src/lib/students/csv-import.ts`
- Create: `src/lib/students/csv-import.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  mapGenderLabel,
  parseCsvText,
  parseThaiBirthdateShort,
  validateAndBuildImportRows,
} from "@/lib/students/csv-import";

describe("parseCsvText", () => {
  it("parses quoted fields", () => {
    const rows = parseCsvText('a,b\n1,"hello, world"');
    expect(rows[1][1]).toBe("hello, world");
  });
});

describe("mapGenderLabel", () => {
  it("maps เด็กหญิง to female", () => {
    expect(mapGenderLabel("เด็กหญิง")).toBe("female");
  });
  it("maps เด็กชาย to male", () => {
    expect(mapGenderLabel("เด็กชาย")).toBe("male");
  });
  it("returns null for unknown", () => {
    expect(mapGenderLabel("unknown")).toBeNull();
  });
});

describe("parseThaiBirthdateShort", () => {
  it("parses 21 เม.ย. 55 to 2011-04-21", () => {
    expect(parseThaiBirthdateShort("21 เม.ย. 55")).toBe("2011-04-21");
  });
  it("returns null for invalid", () => {
    expect(parseThaiBirthdateShort("not a date")).toBeNull();
  });
});

describe("validateAndBuildImportRows", () => {
  const baseRow = {
    student_code: "12390",
    first_name: "ทดสอบ",
    last_name: "นามสกุล",
    gender: "เด็กชาย",
    birthdate: "25 ก.ค. 54",
    id_card: "",
  };

  it("builds ready row when valid", () => {
    const result = validateAndBuildImportRows(
      [{ ...baseRow, rowNumber: 2 }],
      new Set(),
    );
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].studentCode).toBe("12390");
    expect(result.errors).toHaveLength(0);
  });

  it("errors when student_code exists in DB", () => {
    const result = validateAndBuildImportRows(
      [{ ...baseRow, rowNumber: 2 }],
      new Set(["12390"]),
    );
    expect(result.ready).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/มีในระบบแล้ว/);
  });

  it("errors duplicate code in file on second row", () => {
    const result = validateAndBuildImportRows(
      [
        { ...baseRow, rowNumber: 2 },
        { ...baseRow, rowNumber: 3 },
      ],
      new Set(),
    );
    expect(result.ready).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/ซ้ำในไฟล์/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- src/lib/students/csv-import.test.ts`

- [ ] **Step 3: Implement `csv-import.ts`**

Key logic:

```ts
import { formatThaiBirthDate, isFutureIsoDate, THAI_MONTHS_SHORT } from "@/lib/students/dates";
import { CSV_REQUIRED_HEADERS } from "@/lib/students/csv-format";

const THAI_BE_TWO_DIGIT_BASE = 2500;

export function parseCsvText(text: string): string[][] { /* RFC-style quoted CSV */ }

export function rowsToObjects(header: string[], dataRows: string[][]): CsvStudentRow[] {
  return dataRows.map((cells, i) => {
    const obj: CsvStudentRow = {};
    header.forEach((key, col) => { obj[key.trim()] = (cells[col] ?? "").trim(); });
    obj.rowNumber = String(i + 2); // attach for errors — or pass row index separately
    return obj;
  });
}

export function assertRequiredHeaders(header: string[]): string | null {
  const missing = CSV_REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length === 0) return null;
  return `คอลัมน์ที่ขาด: ${missing.join(", ")}`;
}

export function mapGenderLabel(label: string): "male" | "female" | null {
  const t = label.trim();
  if (["เด็กชาย", "นาย"].includes(t)) return "male";
  if (["เด็กหญิง", "นาง", "นางสาว"].includes(t)) return "female";
  return null;
}

export function parseThaiBirthdateShort(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const monthIndex = THAI_MONTHS_SHORT.indexOf(m[2] as typeof THAI_MONTHS_SHORT[number]);
  if (monthIndex === -1) return null;
  const beYear = THAI_BE_TWO_DIGIT_BASE + Number(m[3]);
  const ceYear = beYear - 543;
  const iso = `${ceYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (isFutureIsoDate(iso)) return null;
  // validate day exists (e.g. Feb 30)
  const [y, mo, d] = iso.split("-").map(Number);
  const check = new Date(y, mo - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null;
  return iso;
}

export function validateAndBuildImportRows(
  rows: Array<CsvStudentRow & { rowNumber: number }>,
  existingCodes: Set<string>,
): { ready: ImportStudentRow[]; errors: ImportRowError[] } {
  const seenInFile = new Set<string>();
  const ready: ImportStudentRow[] = [];
  const errors: ImportRowError[] = [];

  for (const row of rows) {
    const code = row.student_code?.trim() ?? "";
    const err = (message: string) => errors.push({ row: row.rowNumber, studentCode: code || undefined, message });

    if (!code || !row.first_name?.trim() || !row.last_name?.trim() || !row.gender?.trim() || !row.birthdate?.trim()) {
      err("ข้อมูลไม่ครบ");
      continue;
    }
    if (existingCodes.has(code)) {
      err("รหัสนักเรียนนี้มีในระบบแล้ว");
      continue;
    }
    if (seenInFile.has(code)) {
      err("รหัสนักเรียนซ้ำในไฟล์ (แถวนี้)");
      continue;
    }
    const gender = mapGenderLabel(row.gender);
    if (!gender) {
      err("ไม่รู้จักคำนำหน้า/เพศ");
      continue;
    }
    const dateOfBirth = parseThaiBirthdateShort(row.birthdate);
    if (!dateOfBirth) {
      err("รูปแบบวันเกิดไม่ถูกต้องหรือเป็นวันในอนาคต");
      continue;
    }
    seenInFile.add(code);
    ready.push({
      studentCode: code,
      firstName: row.first_name.trim(),
      lastName: row.last_name.trim(),
      gender,
      dateOfBirth,
      idCard: row.id_card?.trim() || null,
    });
  }
  return { ready, errors };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- src/lib/students/csv-import.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/students/csv-import.ts src/lib/students/csv-import.test.ts
git commit -m "feat: parse and validate student CSV import rows"
```

---

### Task 3: Server actions — preview and confirm

**Files:**
- Modify: `src/lib/actions/students.ts`

- [ ] **Step 1: Add `previewStudentCsvImport`**

```ts
export async function previewStudentCsvImport(
  rows: CsvStudentRow[],
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      stats: { ready: number; errors: number };
      ready: ImportStudentRow[];
      preview: ImportStudentPreview[];
      errors: ImportRowError[];
    }
> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const codes = rows.map((r) => r.student_code?.trim()).filter(Boolean);
  const { data: existing } = await supabase
    .from("students")
    .select("student_code")
    .in("student_code", [...new Set(codes)]);

  const existingSet = new Set((existing ?? []).map((s) => s.student_code));
  // map rows with rowNumber from client
  const { ready, errors } = validateAndBuildImportRows(mappedRows, existingSet);

  const preview = ready.slice(0, 10).map((r) => ({
    studentCode: r.studentCode,
    name: `${r.firstName} ${r.lastName}`,
    genderLabel: STUDENT_GENDER_LABELS[r.gender],
    birthDateLabel: formatThaiBirthDate(r.dateOfBirth),
  }));

  return { ok: true, stats: { ready: ready.length, errors: errors.length }, ready, preview, errors };
}
```

- [ ] **Step 2: Add `confirmStudentCsvImport`**

```ts
export async function confirmStudentCsvImport(rows: ImportStudentRow[]) {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const codes = rows.map((r) => r.studentCode);
  const { data: existing } = await supabase
    .from("students")
    .select("student_code")
    .in("student_code", codes);

  const existingSet = new Set((existing ?? []).map((s) => s.student_code));
  const { ready, errors: revalidateErrors } = validateAndBuildImportRows(
    rows.map((r, i) => csvRowFromImport(r, i + 2)),
    existingSet,
  );

  if (ready.length === 0) {
    return { ok: true as const, imported: 0, errors: revalidateErrors };
  }

  const inserts = ready.map((r) => ({
    student_code: r.studentCode,
    first_name: r.firstName,
    last_name: r.lastName,
    gender: r.gender,
    date_of_birth: r.dateOfBirth,
    id_card: r.idCard,
    status: "active" as const,
  }));

  const { error } = await supabase.from("students").insert(inserts);
  if (error) return { ok: false as const, error: "ไม่สามารถนำเข้านักเรียนได้" };

  revalidatePath("/students");
  return { ok: true as const, imported: ready.length, errors: revalidateErrors };
}
```

Batch insert in chunks of 100 if `rows.length > 100`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/students.ts
git commit -m "feat: server actions for student CSV import preview and confirm"
```

---

### Task 4: StudentImportDialog UI

**Files:**
- Create: `src/components/students/student-import-dialog.tsx`
- Modify: `src/components/students/students-panel.tsx`

- [ ] **Step 1: Create dialog component**

States: `idle` | `parsed` | `importing`

On open: show `CSV_FORMAT_TABLE` in Table (key, description, example)

Button `ดาวน์โหลดไฟล์ตัวอย่าง`:
```ts
function downloadSample() {
  const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "student-import-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}
```

File input `onChange`:
1. `FileReader.readAsText` UTF-8
2. `parseCsvText` → header + data rows
3. Check `assertRequiredHeaders`, max 500 rows
4. Call `previewStudentCsvImport` with row objects
5. Store `ready`, `errors`, `preview`, `stats` in state

Render errors Table + preview Table

Confirm → `confirmStudentCsvImport(ready)` → toast → `router.refresh()` → close

- [ ] **Step 2: Add button to StudentsPanel**

```tsx
{isAdmin ? (
  <>
    <Button variant="outline" onClick={() => setImportOpen(true)}>นำเข้า CSV</Button>
    <Button onClick={() => setCreateOpen(true)}>เพิ่มนักเรียน</Button>
  </>
) : null}

<StudentImportDialog open={importOpen} onOpenChange={setImportOpen} />
```

- [ ] **Step 3: Manual smoke**

- Open dialog → format table visible
- Download sample works
- Upload sample CSV → preview + confirm → students appear

- [ ] **Step 4: Commit**

```bash
git add src/components/students/student-import-dialog.tsx src/components/students/students-panel.tsx
git commit -m "feat: student CSV import dialog on students page"
```

---

### Task 5: Verification

- [ ] **Step 1:** `npm test`
- [ ] **Step 2:** `npm run build`
- [ ] **Step 3:** Manual checklist from spec §11

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Admin-only button | Task 4 |
| Format table on open | Task 1, 4 |
| Download sample | Task 1, 4 |
| Preview + errors + 10-row preview | Task 2, 3, 4 |
| Duplicate DB / file rules | Task 2 |
| BE 2-digit → ISO CE | Task 2 |
| Gender label mapping | Task 2 |
| status active | Task 3 |
| 500 row limit | Task 1, 4 |
| Re-validate on confirm | Task 3 |
