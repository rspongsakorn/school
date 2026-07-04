# Student default "เบิกได้" (reimbursable) flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a per-student "เบิกได้" (reimbursable) flag that is set on the student profile, shown as a badge in the students table, and used to pre-tick students when generating invoices (still editable per batch).

**Architecture:** Add a `students.is_reimbursable` boolean column. Thread it through the student form (create/edit), the student list data layers (server + client fetch), the students table UI, and the invoice-candidate data layer. In the invoice-generate dialog, seed the reimbursable selection from this flag instead of an empty set.

**Tech Stack:** Next.js (App Router) server actions + server components, Supabase (Postgres) via `@supabase/supabase-js`, React + TanStack Query, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-05-student-default-reimbursable-design.md`

---

## File Structure

- **Create** `supabase/migrations/20260705000000_student_reimbursable.sql` — adds the column.
- **Modify** `src/lib/students/validation.ts` — add `isReimbursable` to `StudentFormInput`.
- **Modify** `src/lib/students/validation.test.ts` — update the shared `base` fixture.
- **Modify** `src/lib/actions/students.ts` — write `is_reimbursable` in create/update.
- **Modify** `src/lib/data/students.ts` — add field to `StudentListRow`, select + map it (server path).
- **Modify** `src/lib/queries/students.ts` — select + map it (client fetch path).
- **Modify** `src/components/students/student-sheet.tsx` — form field + `initial` prop.
- **Modify** `src/components/students/students-panel.tsx` — badge + pass value to sheet.
- **Create** `src/lib/finance/reimbursable-selection.ts` — pure helper for default ids.
- **Create** `src/lib/finance/reimbursable-selection.test.ts` — unit test for helper.
- **Modify** `src/lib/data/invoices.ts` — add `defaultReimbursable` to candidate row + query.
- **Modify** `src/components/finance/invoice-generate-dialog.tsx` — seed selection from helper.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260705000000_student_reimbursable.sql`

- [ ] **Step 1: Write the migration**

```sql
-- students: persistent default for the reimbursable ("เบิกได้") price variant.
-- Used to pre-select students when generating invoices; existing rows default to
-- non-reimbursable, matching prior behavior.
ALTER TABLE public.students
  ADD COLUMN is_reimbursable boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration to the local DB**

Run: `npm run db:push`
Expected: applies `20260705000000_student_reimbursable.sql` with no error. (If the
local stack is not running, run `npm run db:start` first, or use `npm run db:reset`
to rebuild from all migrations.)

- [ ] **Step 3: Verify the column exists**

Run:
```bash
npx supabase db execute --sql "select column_name, data_type, column_default from information_schema.columns where table_name='students' and column_name='is_reimbursable';"
```
Expected: one row — `is_reimbursable | boolean | false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260705000000_student_reimbursable.sql
git commit -m "feat(db): add students.is_reimbursable column"
```

---

## Task 2: Extend student form validation type

`StudentFormInput` is the shared shape for the student form. Adding the boolean here
makes the compiler flag every place that must pass it. No new validation rule is
needed (a boolean is always valid).

**Files:**
- Modify: `src/lib/students/validation.ts:4-12`
- Test: `src/lib/students/validation.test.ts:4-12`

- [ ] **Step 1: Update the test fixture to include the new field**

In `src/lib/students/validation.test.ts`, add `isReimbursable: false` to the shared
`base` object so it satisfies the updated `StudentFormInput` type:

```ts
const base = {
  studentCode: "67001",
  firstName: "สมชาย",
  lastName: "ใจดี",
  idCard: "",
  status: "active" as const,
  gender: "" as const,
  dateOfBirth: "",
  isReimbursable: false,
};
```

Also update the inline object in the "returns field errors for missing required
fields" test (`src/lib/students/validation.test.ts:26-34`) to include
`isReimbursable: false`:

```ts
    const result = validateStudentForm(
      {
        studentCode: "",
        firstName: "",
        lastName: "",
        idCard: "",
        status: "active",
        gender: "",
        dateOfBirth: "",
        isReimbursable: false,
      },
      { mode: "create" },
    );
```

- [ ] **Step 2: Run the test to verify it fails to type-check / run**

Run: `npx tsc --noEmit`
Expected: FAIL — `isReimbursable` does not exist on `StudentFormInput` (the type
does not have it yet).

- [ ] **Step 3: Add the field to `StudentFormInput`**

In `src/lib/students/validation.ts`, extend the type:

```ts
export type StudentFormInput = {
  studentCode: string;
  firstName: string;
  lastName: string;
  idCard: string;
  status: StudentStatus;
  gender: "" | StudentGender;
  dateOfBirth: string;
  isReimbursable: boolean;
};
```

- [ ] **Step 4: Run type-check and tests**

Run: `npx tsc --noEmit && npm run test -- src/lib/students/validation.test.ts`
Expected: type-check PASSES for these files; validation tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/students/validation.ts src/lib/students/validation.test.ts
git commit -m "feat(students): add isReimbursable to StudentFormInput"
```

---

## Task 3: Write the flag in server actions

**Files:**
- Modify: `src/lib/actions/students.ts:447-455` (createStudent insert)
- Modify: `src/lib/actions/students.ts:488-499` (updateStudent update)

- [ ] **Step 1: Add `is_reimbursable` to the create insert**

In `createStudent`, update the `.insert({ ... })` object:

```ts
  const { error } = await supabase.from("students").insert({
    student_code: input.studentCode.trim(),
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    id_card: input.idCard.trim() || null,
    gender: input.gender || null,
    date_of_birth: input.dateOfBirth.trim() || null,
    status: input.status,
    is_reimbursable: input.isReimbursable,
  });
```

- [ ] **Step 2: Add `is_reimbursable` to the update**

In `updateStudent`, update the `.update({ ... })` object:

```ts
    .update({
      student_code: input.studentCode.trim(),
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      id_card: input.idCard.trim() || null,
      gender: input.gender || null,
      date_of_birth: input.dateOfBirth.trim() || null,
      status: input.status,
      is_reimbursable: input.isReimbursable,
    })
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/students.ts
git commit -m "feat(students): persist is_reimbursable on create/update"
```

---

## Task 4: Expose the flag in the student list data layers

`StudentListRow` is produced by two code paths: the server data layer
(`src/lib/data/students.ts`) and the client fetch (`src/lib/queries/students.ts`).
Both must select and map the column.

**Files:**
- Modify: `src/lib/data/students.ts:13-26` (type), `:43-72` (mapStudentRow), `:136-139` and `:169-175` (selects)
- Modify: `src/lib/queries/students.ts:72-82` (select), `:94-110` (map)

- [ ] **Step 1: Add the field to `StudentListRow`**

In `src/lib/data/students.ts`:

```ts
export type StudentListRow = {
  id: string;
  studentCode: string;
  name: string;
  idCard: string | null;
  grade: string;
  status: string;
  statusRaw: StudentStatus;
  firstName: string;
  lastName: string;
  gender: StudentGender | null;
  dateOfBirth: string | null;
  isReimbursable: boolean;
  deletable: boolean;
};
```

- [ ] **Step 2: Map it in `mapStudentRow`**

Update the `s` parameter type and the returned object in `mapStudentRow`
(`src/lib/data/students.ts:43-72`):

```ts
function mapStudentRow(
  s: {
    id: string;
    student_code: string;
    first_name: string;
    last_name: string;
    id_card: string | null;
    gender: string | null;
    date_of_birth: string | null;
    status: string;
    is_reimbursable: boolean;
  },
  gradeByStudent: Map<string, string>,
  blockedStudentIds: Set<string>,
): StudentListRow {
  const statusRaw = s.status as StudentStatus;
  return {
    id: s.id,
    studentCode: s.student_code,
    name: formatStudentName(s.first_name, s.last_name),
    idCard: s.id_card,
    grade: gradeByStudent.get(s.id) ?? "—",
    status: STUDENT_STATUS_LABELS[statusRaw] ?? s.status,
    statusRaw,
    firstName: s.first_name,
    lastName: s.last_name,
    gender: (s.gender as StudentGender | null) ?? null,
    dateOfBirth: s.date_of_birth ?? null,
    isReimbursable: s.is_reimbursable,
    deletable: !blockedStudentIds.has(s.id),
  };
}
```

- [ ] **Step 3: Add `is_reimbursable` to both selects in this file**

In `listStudents` (`src/lib/data/students.ts:136-139`):

```ts
  const { data: students, error } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name, id_card, gender, date_of_birth, status, is_reimbursable")
    .order("student_code", { ascending: true });
```

In `listStudentsPaginated` (`src/lib/data/students.ts:169-175`):

```ts
    let query = supabase
      .from("students")
      .select(
        "id, student_code, first_name, last_name, id_card, gender, date_of_birth, status, is_reimbursable",
        { count: "exact" },
      )
      .order("student_code", { ascending: true });
```

- [ ] **Step 4: Update the client fetch path**

In `src/lib/queries/students.ts`, add `is_reimbursable` to the select
(`:74-77`):

```ts
    let query = supabase
      .from("students")
      .select("id, student_code, first_name, last_name, id_card, gender, date_of_birth, status, is_reimbursable", {
        count: "exact",
      })
      .order("student_code", { ascending: true });
```

And map it in the row builder (`:94-110`), adding one line before `deletable`:

```ts
      dateOfBirth: s.date_of_birth ?? null,
      isReimbursable: s.is_reimbursable,
      deletable: !blockedStudentIds.has(s.id),
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/students.ts src/lib/queries/students.ts
git commit -m "feat(students): expose isReimbursable in list data layers"
```

---

## Task 5: Student form field (create + edit) and page wiring

**Files:**
- Modify: `src/components/students/student-sheet.tsx` (initial prop, form state, field UI)
- Modify: `src/components/students/students-panel.tsx` (pass value into sheet's `initial`)

- [ ] **Step 1: Extend the `initial` prop type**

In `src/components/students/student-sheet.tsx`, add to the `initial` object type
(`:61-71`):

```ts
  initial?: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
    idCard: string | null;
    gender: StudentGender | null;
    dateOfBirth: string | null;
    status: StudentStatus;
    isReimbursable: boolean;
    deletable?: boolean;
  };
```

- [ ] **Step 2: Add the field to the initial form state and builder**

Update `initialForm` (`:80-88`):

```ts
const initialForm: StudentFormState = {
  studentCode: "",
  firstName: "",
  lastName: "",
  idCard: "",
  gender: "",
  dateOfBirth: "",
  status: "active",
  isReimbursable: false,
};
```

Update `buildInitialForm` edit branch (`:94-104`):

```ts
  if (mode === "edit" && initial) {
    return {
      studentCode: initial.studentCode,
      firstName: initial.firstName,
      lastName: initial.lastName,
      idCard: initial.idCard ?? "",
      gender: initial.gender ?? "",
      dateOfBirth: initial.dateOfBirth ?? "",
      status: initial.status,
      isReimbursable: initial.isReimbursable,
    };
  }
```

- [ ] **Step 3: Add the toggle field to the form**

In `src/components/students/student-sheet.tsx`, add this block inside the
`<div className="grid gap-4">` form container, right after the status field's
closing `</div>` (`:354`), before the container's closing `</div>` (`:355`). It
reuses the pill-toggle style from the invoice-generate dialog:

```tsx
        <div className="grid gap-2">
          <Label htmlFor="student-reimbursable">การเบิก</Label>
          {readOnly ? (
            <p id="student-reimbursable" className="text-sm">
              {form.isReimbursable ? "เบิกได้" : "เบิกไม่ได้"}
            </p>
          ) : (
            <button
              id="student-reimbursable"
              type="button"
              role="switch"
              aria-checked={form.isReimbursable}
              onClick={() => updateField("isReimbursable", !form.isReimbursable)}
              disabled={submitting}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              <span>{form.isReimbursable ? "เบิกได้" : "เบิกไม่ได้"}</span>
              <span
                className={cn(
                  "relative h-6 w-[54px] shrink-0 rounded-full transition-colors",
                  form.isReimbursable ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] size-[18px] rounded-full bg-white shadow-sm transition-all",
                    form.isReimbursable ? "left-[33px]" : "left-[3px]",
                  )}
                />
              </span>
            </button>
          )}
        </div>
```

- [ ] **Step 4: Import `cn`**

At the top of `src/components/students/student-sheet.tsx`, add the import if not
already present:

```ts
import { cn } from "@/lib/utils";
```

- [ ] **Step 5: Pass the value from the panel into the sheet**

In `src/components/students/students-panel.tsx`, find where `selectedStudent` is
mapped into the sheet's `initial` (around `:243`, the object with
`status: selectedStudent.statusRaw`). Add:

```ts
      status: selectedStudent.statusRaw,
      isReimbursable: selectedStudent.isReimbursable,
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/students/student-sheet.tsx src/components/students/students-panel.tsx
git commit -m "feat(students): reimbursable toggle in student form"
```

---

## Task 6: "เบิกได้" badge in the students table

The panel renders a status `Badge` in both the mobile card view (`~:345-347`) and
the desktop table view (`~:415-417`). Add a reimbursable badge next to each, shown
only when the student is reimbursable.

**Files:**
- Modify: `src/components/students/students-panel.tsx`

- [ ] **Step 1: Add the badge in the mobile card view**

In `src/components/students/students-panel.tsx`, right after the status `<Badge>`
in the mobile card view (`~:345-347`), add:

```tsx
                          <Badge className={statusBadgeClass(student.statusRaw)}>
                            {student.status}
                          </Badge>
                          {student.isReimbursable && (
                            <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">
                              เบิกได้
                            </Badge>
                          )}
```

- [ ] **Step 2: Add the badge in the desktop table view**

Right after the status `<Badge>` in the desktop table cell (`~:415-417`), add the
same conditional badge:

```tsx
                                  <Badge className={statusBadgeClass(student.statusRaw)}>
                                    {student.status}
                                  </Badge>
                                  {student.isReimbursable && (
                                    <Badge className="ml-1 bg-sky-50 text-sky-700 hover:bg-sky-50">
                                      เบิกได้
                                    </Badge>
                                  )}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/students/students-panel.tsx
git commit -m "feat(students): show เบิกได้ badge in students table"
```

---

## Task 7: Invoice candidate default + selection helper (TDD)

Extract the "which candidates start ticked" logic into a pure, testable helper, and
add `defaultReimbursable` to the candidate row.

**Files:**
- Create: `src/lib/finance/reimbursable-selection.ts`
- Test: `src/lib/finance/reimbursable-selection.test.ts`
- Modify: `src/lib/data/invoices.ts:227-235` (type), `:245-269` (query + map)

- [ ] **Step 1: Write the failing test**

Create `src/lib/finance/reimbursable-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultReimbursableIds } from "@/lib/finance/reimbursable-selection";

describe("defaultReimbursableIds", () => {
  it("returns ids of candidates flagged defaultReimbursable", () => {
    const result = defaultReimbursableIds([
      { studentId: "a", defaultReimbursable: true },
      { studentId: "b", defaultReimbursable: false },
      { studentId: "c", defaultReimbursable: true },
    ]);
    expect(result).toEqual(new Set(["a", "c"]));
  });

  it("returns an empty set when none are flagged", () => {
    const result = defaultReimbursableIds([
      { studentId: "a", defaultReimbursable: false },
    ]);
    expect(result).toEqual(new Set());
  });

  it("returns an empty set for an empty list", () => {
    expect(defaultReimbursableIds([])).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/lib/finance/reimbursable-selection.test.ts`
Expected: FAIL — cannot find module `@/lib/finance/reimbursable-selection`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/finance/reimbursable-selection.ts`:

```ts
export function defaultReimbursableIds(
  candidates: { studentId: string; defaultReimbursable: boolean }[],
): Set<string> {
  return new Set(
    candidates.filter((c) => c.defaultReimbursable).map((c) => c.studentId),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/lib/finance/reimbursable-selection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add `defaultReimbursable` to `InvoiceCandidateRow`**

In `src/lib/data/invoices.ts` (`:227-235`):

```ts
export type InvoiceCandidateRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  gradeSortOrder: number;
  /** Invoice type ids the student already has an invoice for this semester. */
  invoiceTypeIds: string[];
  /** Student-level default: pre-tick as reimbursable when generating. */
  defaultReimbursable: boolean;
};
```

- [ ] **Step 6: Select and map the column in `listInvoiceCandidates`**

Update the select (`:245-255`) to pull `is_reimbursable` from the joined student:

```ts
  const { data } = await supabase
    .from("student_enrollments")
    .select(
      `
      student_id,
      students!inner ( student_code, first_name, last_name, is_reimbursable )
    `,
    )
    .eq("semester_id", semesterId)
    .eq("status", "enrolled")
    .order("student_code", { ascending: true, foreignTable: "students" });
```

Update the `Row` type and the mapping (`:257-269`):

```ts
  type Row = {
    student_id: string;
    students: {
      student_code: string;
      first_name: string;
      last_name: string;
      is_reimbursable: boolean;
    };
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    studentId: row.student_id,
    studentCode: row.students.student_code,
    studentName: formatStudentName(row.students.first_name, row.students.last_name),
    gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
    gradeSortOrder: gradeSortByStudent.get(row.student_id) ?? 0,
    invoiceTypeIds: [...(typesByStudent.get(row.student_id) ?? [])],
    defaultReimbursable: row.students.is_reimbursable,
  }));
```

- [ ] **Step 7: Type-check and run tests**

Run: `npx tsc --noEmit && npm run test -- src/lib/finance/reimbursable-selection.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/finance/reimbursable-selection.ts src/lib/finance/reimbursable-selection.test.ts src/lib/data/invoices.ts
git commit -m "feat(finance): candidate defaultReimbursable + selection helper"
```

---

## Task 8: Seed generate-dialog selection from the flag

**Files:**
- Modify: `src/components/finance/invoice-generate-dialog.tsx:81` (initial state), `:88-97` (reset effect)

- [ ] **Step 1: Import the helper**

At the top of `src/components/finance/invoice-generate-dialog.tsx`, add:

```ts
import { defaultReimbursableIds } from "@/lib/finance/reimbursable-selection";
```

- [ ] **Step 2: Seed the initial state**

Change the `reimbursableStudentIds` initializer (`:81`) from an empty set to the
default:

```ts
  const [reimbursableStudentIds, setReimbursableStudentIds] = useState<Set<string>>(
    () => defaultReimbursableIds(candidates),
  );
```

- [ ] **Step 3: Seed on dialog open in the reset effect**

In the reset `useEffect` (`:88-97`), replace the reimbursable reset line
`setReimbursableStudentIds(new Set());` with:

```ts
    setReimbursableStudentIds(defaultReimbursableIds(candidates));
```

The effect currently depends only on `open`. Keep the existing
`// eslint-disable-line react-hooks/exhaustive-deps` comment on the dependency
array — `candidates` is a stable prop for the dialog's lifetime, and we
intentionally re-seed only when the dialog (re)opens.

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/invoice-generate-dialog.tsx
git commit -m "feat(finance): pre-tick reimbursable students in generate dialog"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: PASS (all suites).

- [ ] **Step 2: Type-check and lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Manual preview check**

Start the dev server (via the preview tooling) and verify end to end:
1. Students page → add a student with the "เบิกได้" toggle ON → save.
2. The new student shows a "เบิกได้" badge in the table.
3. Edit that student → the toggle reflects ON; toggle OFF, save → badge disappears.
4. Enroll the student in the current semester (if not already), open the invoice
   **generate** dialog, pick an invoice type → the reimbursable student is
   pre-ticked in the "เบิก" column; untick works and updates the count.
5. Generate → the resulting invoice reflects the final (post-untick) selection.

- [ ] **Step 5: Final commit (if any residual changes)**

```bash
git add -A
git commit -m "chore: verify student reimbursable flag end to end"
```

---

## Self-review notes

- **Spec coverage:** Part 1 → Task 1; Part 2 (form + actions + data) → Tasks 2–5;
  Part 2b (badge) → Task 6; Part 3 (candidate default + dialog seed) → Tasks 7–8;
  Testing section → Tasks 7 and 9.
- **Out of scope confirmed untouched:** CSV import, existing invoices, price
  calculation — no task modifies them.
- **Type consistency:** field is `isReimbursable` (camelCase) on all TS types
  (`StudentFormInput`, `StudentListRow`, `initial` prop) and `is_reimbursable`
  (snake_case) at every Supabase boundary; candidate field is `defaultReimbursable`
  used identically in `InvoiceCandidateRow`, the helper, and the dialog.
