# Student Gender & Birth Date (BE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `gender` (ชาย/หญิง) and Buddhist-Era date-of-birth picker to the student create/edit form, with grandfathered validation for legacy rows.

**Architecture:** Nullable DB columns + ISO `date` storage; Thai BE display only in the form layer via `dates.ts` helpers and a shadcn Calendar/Popover; validation rules differ by create vs update and existing DB values. No changes to list tables, receipts, or `formatStudentName`.

**Tech Stack:** Next.js 16 App Router, Supabase, Vitest, shadcn/ui Calendar (`react-day-picker`, `date-fns`).

**React best practices (required before coding):** Read `vendor/react-best-practices/` per `.cursor/skills/react-best-practices/SKILL.md`.

**Spec:** [2026-05-24-student-gender-birth-date-design.md](../specs/2026-05-24-student-gender-birth-date-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260524150000_student_gender_birth_date.sql` | `student_gender` enum + columns |
| `src/lib/students/constants.ts` | `STUDENT_GENDER_OPTIONS`, `StudentGender` type |
| `src/lib/students/dates.ts` | BE year, ISO date parse/format (no timezone drift) |
| `src/lib/students/dates.test.ts` | Unit tests for dates |
| `src/lib/students/validation.ts` | Extended form validation with mode + existing |
| `src/lib/students/validation.test.ts` | Extended validation tests |
| `src/lib/supabase/types.ts` | `gender`, `date_of_birth` on `students` |
| `src/lib/data/students.ts` | SELECT + map new fields (not table columns) |
| `src/lib/actions/students.ts` | Persist new fields on create/update |
| `src/components/ui/popover.tsx` | shadcn Popover (if missing) |
| `src/components/ui/calendar.tsx` | shadcn Calendar |
| `src/components/students/birth-date-picker.tsx` | Popover + Calendar with BE caption |
| `src/components/students/student-sheet.tsx` | Gender select + birth date picker |
| `src/components/students/students-panel.tsx` | Pass `gender`/`dateOfBirth` in `selectedInitial` |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260524150000_student_gender_birth_date.sql`

- [ ] **Step 1: Add migration file**

```sql
CREATE TYPE public.student_gender AS ENUM ('male', 'female');

ALTER TABLE public.students
  ADD COLUMN gender public.student_gender,
  ADD COLUMN date_of_birth date;
```

- [ ] **Step 2: Apply locally**

Run: `npm run db:push`  
Expected: migration applies without error

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260524150000_student_gender_birth_date.sql
git commit -m "feat(db): add student gender and date_of_birth"
```

---

### Task 2: Gender constants

**Files:**
- Modify: `src/lib/students/constants.ts`

- [ ] **Step 1: Add types and options**

```ts
export type StudentGender = "male" | "female";

export const STUDENT_GENDER_OPTIONS = [
  { value: "male" as const, label: "ชาย" },
  { value: "female" as const, label: "หญิง" },
] as const;

export const STUDENT_GENDER_LABELS: Record<StudentGender, string> = {
  male: "ชาย",
  female: "หญิง",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/students/constants.ts
git commit -m "feat: student gender constants"
```

---

### Task 3: Date helpers (TDD)

**Files:**
- Create: `src/lib/students/dates.ts`
- Create: `src/lib/students/dates.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  formatThaiBirthDate,
  isoDateFromLocalDate,
  isFutureIsoDate,
  parseIsoDateOnly,
  toBuddhistYear,
} from "@/lib/students/dates";

describe("toBuddhistYear", () => {
  it("adds 543 to CE year", () => {
    expect(toBuddhistYear(2007)).toBe(2550);
  });
});

describe("parseIsoDateOnly / isoDateFromLocalDate", () => {
  it("round-trips without timezone shift", () => {
    const date = parseIsoDateOnly("2007-05-15");
    expect(isoDateFromLocalDate(date)).toBe("2007-05-15");
  });
});

describe("formatThaiBirthDate", () => {
  it("formats with Buddhist year", () => {
    expect(formatThaiBirthDate("2007-05-15")).toBe("15 พ.ค. 2550");
  });
});

describe("isFutureIsoDate", () => {
  it("returns true for tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isFutureIsoDate(isoDateFromLocalDate(tomorrow))).toBe(true);
  });

  it("returns false for today", () => {
    expect(isFutureIsoDate(isoDateFromLocalDate(new Date()))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- src/lib/students/dates.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement `dates.ts`**

```ts
const BE_OFFSET = 543;

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
] as const;

export function toBuddhistYear(ceYear: number): number {
  return ceYear + BE_OFFSET;
}

export function parseIsoDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDateFromLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatThaiBirthDate(isoDate: string): string {
  const date = parseIsoDateOnly(isoDate);
  const day = date.getDate();
  const month = THAI_MONTHS_SHORT[date.getMonth()];
  const beYear = toBuddhistYear(date.getFullYear());
  return `${day} ${month} ${beYear}`;
}

export function isFutureIsoDate(isoDate: string): boolean {
  const today = isoDateFromLocalDate(new Date());
  return isoDate > today;
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm test -- src/lib/students/dates.test.ts`  
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/students/dates.ts src/lib/students/dates.test.ts
git commit -m "feat: student birth date helpers with BE formatting"
```

---

### Task 4: Form validation (TDD)

**Files:**
- Modify: `src/lib/students/validation.ts`
- Modify: `src/lib/students/validation.test.ts`

- [ ] **Step 1: Extend types in `validation.ts`**

```ts
import type { StudentGender } from "@/lib/students/constants";
import { isFutureIsoDate } from "@/lib/students/dates";

export type StudentFormInput = {
  studentCode: string;
  firstName: string;
  lastName: string;
  idCard: string;
  status: StudentStatus;
  gender: "" | StudentGender;
  dateOfBirth: string;
};

export type StudentFormErrors = Partial<
  Record<
    "studentCode" | "firstName" | "lastName" | "gender" | "dateOfBirth",
    string
  >
>;

export type ValidateStudentFormOptions = {
  mode: "create" | "update";
  existing?: {
    gender: StudentGender | null;
    dateOfBirth: string | null;
  };
};
```

Change signature to:

```ts
export function validateStudentForm(
  input: StudentFormInput,
  options: ValidateStudentFormOptions,
): { ok: true } | { ok: false; errors: StudentFormErrors }
```

- [ ] **Step 2: Add failing tests** (append to `validation.test.ts`)

```ts
const base = {
  studentCode: "67001",
  firstName: "สมชาย",
  lastName: "ใจดี",
  idCard: "",
  status: "active" as const,
  gender: "" as const,
  dateOfBirth: "",
};

describe("validateStudentForm gender and birth date", () => {
  it("requires gender and dateOfBirth on create", () => {
    const result = validateStudentForm(
      { ...base, gender: "", dateOfBirth: "" },
      { mode: "create" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.gender).toBe("กรุณาเลือกเพศ");
      expect(result.errors.dateOfBirth).toBe("กรุณาเลือกวันเกิด");
    }
  });

  it("accepts create when gender and dateOfBirth provided", () => {
    expect(
      validateStudentForm(
        { ...base, gender: "male", dateOfBirth: "2007-05-15" },
        { mode: "create" },
      ),
    ).toEqual({ ok: true });
  });

  it("allows empty gender and dateOfBirth on update for legacy row", () => {
    expect(
      validateStudentForm(
        { ...base, gender: "", dateOfBirth: "" },
        {
          mode: "update",
          existing: { gender: null, dateOfBirth: null },
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects clearing gender on update when previously set", () => {
    const result = validateStudentForm(
      { ...base, gender: "", dateOfBirth: "2007-05-15" },
      {
        mode: "update",
        existing: { gender: "male", dateOfBirth: "2007-05-15" },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.gender).toBe("กรุณาเลือกเพศ");
  });

  it("rejects future birth date", () => {
    const result = validateStudentForm(
      { ...base, gender: "male", dateOfBirth: "2099-01-01" },
      { mode: "create" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.dateOfBirth).toBe("วันเกิดต้องไม่เป็นวันในอนาคต");
    }
  });
});
```

Update existing tests to pass `options: { mode: "create" }` and new fields on `base` input.

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm test -- src/lib/students/validation.test.ts`  
Expected: FAIL on new cases

- [ ] **Step 4: Implement validation logic**

After existing name/code checks:

```ts
const hadGender = Boolean(options.existing?.gender);
const hadBirthDate = Boolean(options.existing?.dateOfBirth);
const requireGender = options.mode === "create" || hadGender;
const requireBirthDate = options.mode === "create" || hadBirthDate;

if (requireGender && !input.gender) {
  errors.gender = "กรุณาเลือกเพศ";
}
if (requireBirthDate && !input.dateOfBirth.trim()) {
  errors.dateOfBirth = "กรุณาเลือกวันเกิด";
} else if (input.dateOfBirth.trim() && isFutureIsoDate(input.dateOfBirth.trim())) {
  errors.dateOfBirth = "วันเกิดต้องไม่เป็นวันในอนาคต";
}
```

Update `firstStudentFormError` to include `gender` and `dateOfBirth`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test -- src/lib/students/validation.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/students/validation.ts src/lib/students/validation.test.ts
git commit -m "feat: validate student gender and birth date by mode"
```

---

### Task 5: Supabase types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Extend `students` Row/Insert/Update**

```ts
students: TableDef<{
  id: string;
  student_code: string;
  first_name: string;
  last_name: string;
  id_card: string | null;
  gender: "male" | "female" | null;
  date_of_birth: string | null;
  status: "active" | "graduated" | "transferred" | "withdrawn";
}>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore: extend students types for gender and birth date"
```

---

### Task 6: Data layer

**Files:**
- Modify: `src/lib/data/students.ts`

- [ ] **Step 1: Extend `StudentListRow`**

```ts
gender: "male" | "female" | null;
dateOfBirth: string | null;
```

- [ ] **Step 2: Add columns to SELECT** (both list queries ~lines 128 and 161)

```ts
.select("id, student_code, first_name, last_name, id_card, gender, date_of_birth, status", ...)
```

- [ ] **Step 3: Map in `mapStudentRow`**

```ts
gender: (s.gender as StudentGender | null) ?? null,
dateOfBirth: s.date_of_birth ?? null,
```

Import `StudentGender` from constants.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/students.ts
git commit -m "feat: load student gender and birth date for edit form"
```

---

### Task 7: Server actions

**Files:**
- Modify: `src/lib/actions/students.ts`

- [ ] **Step 1: Load existing row on update for validation**

Before `validateStudentForm`, fetch existing:

```ts
const { data: existing } = await supabase
  .from("students")
  .select("gender, date_of_birth")
  .eq("id", id)
  .single();
```

- [ ] **Step 2: Pass options to validator**

```ts
// create
validateStudentForm(input, { mode: "create" });

// update
validateStudentForm(input, {
  mode: "update",
  existing: {
    gender: existing?.gender ?? null,
    dateOfBirth: existing?.date_of_birth ?? null,
  },
});
```

- [ ] **Step 3: Persist fields**

```ts
gender: input.gender || null,
date_of_birth: input.dateOfBirth.trim() || null,
```

On both `insert` and `update`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/students.ts
git commit -m "feat: persist student gender and birth date"
```

---

### Task 8: shadcn Calendar + Popover

**Files:**
- Create: `src/components/ui/popover.tsx`
- Create: `src/components/ui/calendar.tsx`

- [ ] **Step 1: Install dependencies and components**

Run:

```bash
npm install react-day-picker date-fns
npx shadcn@latest add popover calendar --yes
```

Expected: `src/components/ui/popover.tsx` and `calendar.tsx` created

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json src/components/ui/popover.tsx src/components/ui/calendar.tsx
git commit -m "chore: add shadcn calendar and popover for birth date"
```

---

### Task 9: Birth date picker component

**Files:**
- Create: `src/components/students/birth-date-picker.tsx`

- [ ] **Step 1: Create client component**

Props:

```ts
type BirthDatePickerProps = {
  id?: string;
  value: string; // ISO or ""
  onChange: (iso: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
};
```

Implementation notes:

- Use `Popover` + `Button` trigger showing `formatThaiBirthDate(value)` or `เลือกวันเกิด`
- `Calendar` `mode="single"`; `selected={value ? parseIsoDateOnly(value) : undefined}`
- `onSelect` → `onChange(isoDateFromLocalDate(date))` and close popover
- Custom `formatters.formatCaption` (react-day-picker v9) to show `toBuddhistYear(monthDate.getFullYear())` in caption
- `disabled` prop on Calendar: dates after today via `disabled={{ after: new Date() }}`
- Read `vendor/react-best-practices/` before coding (client component — keep state local)

- [ ] **Step 2: Manual smoke** (after Task 10 wires it)

Open `/students` → เพิ่มนักเรียน → calendar shows พ.ศ. year in caption

- [ ] **Step 3: Commit**

```bash
git add src/components/students/birth-date-picker.tsx
git commit -m "feat: birth date picker with Buddhist Era display"
```

---

### Task 10: Student sheet UI

**Files:**
- Modify: `src/components/students/student-sheet.tsx`
- Modify: `src/components/students/students-panel.tsx`

- [ ] **Step 1: Extend `StudentSheetProps.initial` and form state**

```ts
gender: "" | StudentGender;
dateOfBirth: string;
// initial edit:
gender: initial.gender ?? "",
dateOfBirth: initial.dateOfBirth ?? "",
```

- [ ] **Step 2: Add fields after นามสกุล**

- `Select` for gender with `STUDENT_GENDER_OPTIONS` and `items` prop
- `BirthDatePicker` for date
- `readOnly`: show `STUDENT_GENDER_LABELS[gender]` and formatted date or `ยังไม่ระบุ`

- [ ] **Step 3: Pass `existing` through actions** — actions already fetch; sheet only sends form

- [ ] **Step 4: Update `students-panel.tsx` `selectedInitial`**

```ts
gender: selectedStudent.gender,
dateOfBirth: selectedStudent.dateOfBirth,
```

- [ ] **Step 5: Commit**

```bash
git add src/components/students/student-sheet.tsx src/components/students/students-panel.tsx
git commit -m "feat: student form gender and birth date fields"
```

---

### Task 11: Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`  
Expected: all pass

- [ ] **Step 2: Run build**

Run: `npm run build`  
Expected: success

- [ ] **Step 3: Manual checklist (spec §11)**

1. Admin → เพิ่มนักเรียน → ต้องเลือกเพศ + วันเกิด (พ.ศ.) ถึงบันทึกได้  
2. แก้ไขนักเรียนเก่าที่ไม่มีเพศ/วันเกิด → บันทึกชื่อได้โดยไม่บังคับสองฟิลด์  
3. แก้ไขนักเรียนที่มีเพศแล้ว → ล้างเพศไม่ได้  
4. ตาราง `/students` ไม่มีคอลัมน์เพศ/วันเกิด  
5. Finance read-only → เห็นค่าแต่แก้ไม่ได้

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `student_gender` enum + nullable columns | Task 1 |
| Create requires gender + DOB | Task 4, 7, 10 |
| Update legacy optional | Task 4, 7 |
| Update cannot clear set values | Task 4 |
| No future dates | Task 3, 4 |
| BE date picker | Task 3, 9, 10 |
| Gender only in form | Task 10 (no table columns) |
| No receipt/name changes | (no tasks — intentional) |
| Unit tests dates + validation | Task 3, 4 |
