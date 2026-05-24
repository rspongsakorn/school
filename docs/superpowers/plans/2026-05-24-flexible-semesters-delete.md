# Flexible Semesters + Delete Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow unlimited add/remove semesters per academic year, delete years/semesters when empty, and block deletes when any referenced data exists.

**Architecture:** Relax DB `semesters.number` constraint; centralize delete checks in `delete-eligibility.ts`; split year edits into `updateYearMetadata` plus per-semester CRUD actions; generalize context/header to dynamic semester lists; update registration copy to pick any source semester.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase PostgreSQL, shadcn/ui + Base UI Select, Vitest, sonner

**Spec:** [2026-05-24-flexible-semesters-delete-design.md](../specs/2026-05-24-flexible-semesters-delete-design.md)

**React best practices (required before coding):** Read `vendor/react-best-practices/SKILL.md` and `vendor/react-best-practices/AGENTS.md` per `.cursor/skills/react-best-practices/SKILL.md`.

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260524150000_flexible_semesters.sql` | Drop `IN (1,2)` check; optional RPC trim |
| `src/lib/academic-year/delete-eligibility.ts` | Pure + async delete guards |
| `src/lib/academic-year/delete-eligibility.test.ts` | Vitest |
| `src/lib/academic-year/semester-dates.ts` | `nextSemesterDefaultDates` for N semesters |
| `src/lib/actions/semesters.ts` | `addSemester`, `updateSemester`, `deleteSemester` |
| `src/lib/actions/academic-years.ts` | `deleteAcademicYear`, `updateYearMetadata`, create with 1 sem |
| `src/lib/context/semester-params.ts` | `number` type, flexible `parseSemesterNumber` |
| `src/lib/context/semester-params.test.ts` | Tests for sem 3, gaps |
| `src/lib/data/semesters.ts` | `getMaxSemesterNumber`, `listSemestersWithGrades` |
| `src/components/context/year-semester-select.tsx` | Dynamic semester items |
| `src/components/academic-year/semester-list-editor.tsx` | Dynamic semester rows in edit dialog |
| `src/components/academic-year/year-table.tsx` | Semester summary + delete year |
| `src/components/academic-year/year-wizard-dialog.tsx` | Start with 1 semester |
| `src/components/academic-year/year-edit-dialog.tsx` | Use semester list editor |
| `src/lib/actions/semester-structure.ts` | `copySemesterStructure(sourceId, targetId)` |
| `src/components/registration/registration-panel.tsx` | Source semester picker for copy |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260524150000_flexible_semesters.sql`

- [ ] **Step 1: Write migration**

```sql
ALTER TABLE public.semesters DROP CONSTRAINT IF EXISTS semesters_number_check;

ALTER TABLE public.semesters
  ADD CONSTRAINT semesters_number_positive_check CHECK (number >= 1);
```

- [ ] **Step 2: Replace create RPC to insert only semester 1**

```sql
CREATE OR REPLACE FUNCTION public.create_academic_year_with_semesters(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_is_active boolean,
  p_sem1_start date,
  p_sem1_end date,
  p_sem1_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_year_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_is_active THEN
    UPDATE public.academic_years SET is_active = false WHERE is_active = true;
  END IF;

  INSERT INTO public.academic_years (name, start_date, end_date, is_active)
  VALUES (trim(p_name), p_start_date, p_end_date, p_is_active)
  RETURNING id INTO v_year_id;

  INSERT INTO public.semesters (academic_year_id, number, name, start_date, end_date)
  VALUES (v_year_id, 1, nullif(trim(p_sem1_name), ''), p_sem1_start, p_sem1_end);

  RETURN v_year_id;
END;
$$;

-- Re-grant with new signature (drop old 10-arg overload if needed in same migration)
```

- [ ] **Step 3: Run migration**

```bash
npm run db:setup
```

Expected: applies without error

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260524150000_flexible_semesters.sql
git commit -m "feat(db): allow flexible semester numbers per academic year"
```

---

### Task 2: Delete eligibility (TDD)

**Files:**
- Create: `src/lib/academic-year/delete-eligibility.ts`
- Create: `src/lib/academic-year/delete-eligibility.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  semesterDeleteBlockedMessage,
  semesterHasBlockingReferences,
  yearDeleteBlockedMessage,
  yearHasBlockingReferences,
  type SemesterReferenceCounts,
  type YearReferenceCounts,
} from "@/lib/academic-year/delete-eligibility";

describe("semesterHasBlockingReferences", () => {
  const empty: SemesterReferenceCounts = {
    gradeLevels: 0,
    classrooms: 0,
    enrollments: 0,
    teacherAssignments: 0,
    feeRates: 0,
    invoices: 0,
  };

  it("blocks when any count > 0", () => {
    expect(semesterHasBlockingReferences({ ...empty, gradeLevels: 1 })).toBe(true);
    expect(semesterHasBlockingReferences(empty)).toBe(false);
  });
});

describe("yearHasBlockingReferences", () => {
  it("blocks when active", () => {
    expect(
      yearHasBlockingReferences(
        { isActive: true, gradeLevels: 0, classrooms: 0, enrollments: 0, teacherAssignments: 0, feeRates: 0, invoices: 0, payments: 0 },
      ),
    ).toBe(true);
  });

  it("blocks when payments exist", () => {
    expect(
      yearHasBlockingReferences({
        isActive: false,
        gradeLevels: 0,
        classrooms: 0,
        enrollments: 0,
        teacherAssignments: 0,
        feeRates: 0,
        invoices: 0,
        payments: 1,
      }),
    ).toBe(true);
  });
});

describe("messages", () => {
  it("returns Thai semester message", () => {
    expect(semesterDeleteBlockedMessage()).toContain("ภาคเรียน");
  });
  it("returns Thai active year message", () => {
    expect(yearDeleteBlockedMessage("year_is_active")).toContain("ใช้งาน");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/lib/academic-year/delete-eligibility.test.ts
```

- [ ] **Step 3: Implement**

`src/lib/academic-year/delete-eligibility.ts`:

```typescript
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
  const { isActive: _, payments, ...semesterLike } = counts;
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

async function countRows(
  table: string,
  column: string,
  id: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, id);
  if (error) return 1; // fail-safe: treat as blocked
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

export async function getYearReferenceCounts(
  yearId: string,
): Promise<YearReferenceCounts> {
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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- src/lib/academic-year/delete-eligibility.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/academic-year/delete-eligibility.ts src/lib/academic-year/delete-eligibility.test.ts
git commit -m "feat: add delete eligibility checks for year and semester"
```

---

### Task 3: Semester server actions

**Files:**
- Create: `src/lib/actions/semesters.ts`
- Modify: `src/lib/academic-year/semester-dates.ts`

- [ ] **Step 1: Add `nextSemesterDefaultDates`**

```typescript
export function nextSemesterDefaultDates(
  yearStart: string,
  yearEnd: string,
  existing: { start_date: string; end_date: string }[],
): { start: string; end: string } {
  if (existing.length === 0) {
    return defaultSemesterDates(yearStart, yearEnd).semester1;
  }
  const sorted = [...existing].sort(
    (a, b) => a.end_date.localeCompare(b.end_date),
  );
  const lastEnd = sorted[sorted.length - 1].end_date;
  const start = addDays(lastEnd, 1);
  if (start > yearEnd) {
    return { start: yearStart, end: yearEnd };
  }
  return { start, end: yearEnd };
}
```

- [ ] **Step 2: Implement `src/lib/actions/semesters.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import {
  assertSemesterDeletable,
  semesterDeleteBlockedMessage,
} from "@/lib/academic-year/delete-eligibility";
import { validateSemesterForm } from "@/lib/academic-year/form-validation";
import { nextSemesterDefaultDates } from "@/lib/academic-year/semester-dates";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/academic-year");
  revalidatePath("/registration");
  revalidatePath("/students");
  revalidatePath("/");
}

export async function addSemester(
  academicYearId: string,
  input?: { name?: string; startDate?: string; endDate?: string },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: year } = await supabase
    .from("academic_years")
    .select("start_date, end_date")
    .eq("id", academicYearId)
    .maybeSingle();
  if (!year) return { ok: false, error: "ไม่พบปีการศึกษา" };

  const { data: existing } = await supabase
    .from("semesters")
    .select("number, start_date, end_date")
    .eq("academic_year_id", academicYearId);

  const maxNumber = (existing ?? []).reduce((m, s) => Math.max(m, s.number), 0);
  const defaults = nextSemesterDefaultDates(year.start_date, year.end_date, existing ?? []);
  const draft = {
    number: maxNumber + 1,
    name: input?.name ?? "",
    startDate: input?.startDate ?? defaults.start,
    endDate: input?.endDate ?? defaults.end,
  };
  const validation = validateSemesterForm(draft, draft.number);
  if (!validation.ok) return { ok: false, error: "วันที่ภาคเรียนไม่ถูกต้อง" };

  const { error } = await supabase.from("semesters").insert({
    academic_year_id: academicYearId,
    number: draft.number,
    name: draft.name.trim() || null,
    start_date: draft.startDate,
    end_date: draft.endDate,
  });

  if (error?.code === "23505") {
    return { ok: false, error: "เลขภาคเรียนนี้มีอยู่แล้ว" };
  }
  if (error) return { ok: false, error: "ไม่สามารถเพิ่มภาคเรียนได้" };

  revalidateAll();
  return { ok: true };
}

export async function updateSemester(
  semesterId: string,
  input: { name: string; startDate: string; endDate: string },
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("semesters")
    .select("number")
    .eq("id", semesterId)
    .maybeSingle();
  if (!row) return { ok: false, error: "ไม่พบภาคเรียน" };

  const validation = validateSemesterForm(
    { number: row.number, name: input.name, startDate: input.startDate, endDate: input.endDate },
    row.number,
  );
  if (!validation.ok) return { ok: false, error: "วันที่ภาคเรียนไม่ถูกต้อง" };

  const { error } = await supabase
    .from("semesters")
    .update({
      name: input.name.trim() || null,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .eq("id", semesterId);

  if (error) return { ok: false, error: "ไม่สามารถแก้ไขภาคเรียนได้" };

  revalidateAll();
  return { ok: true };
}

export async function deleteSemester(semesterId: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const check = await assertSemesterDeletable(semesterId);
  if (!check.ok) {
    return { ok: false, error: semesterDeleteBlockedMessage() };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("semesters").delete().eq("id", semesterId);
  if (error) return { ok: false, error: "ไม่สามารถลบภาคเรียนได้" };

  revalidateAll();
  return { ok: true };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/academic-year/semester-dates.ts src/lib/actions/semesters.ts
git commit -m "feat: add semester CRUD server actions"
```

---

### Task 4: Academic year delete + create/update refactor

**Files:**
- Modify: `src/lib/actions/academic-years.ts`
- Modify: `src/lib/academic-year/form-validation.ts` (accept `number: number` on SemesterInput)

- [ ] **Step 1: Add `deleteAcademicYear`**

```typescript
import {
  assertAcademicYearDeletable,
  yearDeleteBlockedMessage,
} from "@/lib/academic-year/delete-eligibility";

export async function deleteAcademicYear(yearId: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const check = await assertAcademicYearDeletable(yearId);
  if (!check.ok) {
    return { ok: false, error: yearDeleteBlockedMessage(check.reason) };
  }

  const supabase = await createClient();
  await supabase.from("semesters").delete().eq("academic_year_id", yearId);
  const { error } = await supabase.from("academic_years").delete().eq("id", yearId);
  if (error) return { ok: false, error: "ไม่สามารถลบปีการศึกษาได้" };

  revalidatePath("/academic-year");
  revalidatePath("/registration");
  revalidatePath("/students");
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 2: Change `createYearWithSemesters` to pass only sem1 to RPC**

Remove `sem2` args; call RPC with 7 args after migration.

- [ ] **Step 3: Add `updateYearMetadata` — year fields + is_active only**

```typescript
export async function updateYearMetadata(yearId: string, year: YearInput): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;
  const yearError = validateYear(year);
  if (yearError) return { ok: false, error: yearError };

  const supabase = await createClient();
  if (year.isActive) {
    await supabase
      .from("academic_years")
      .update({ is_active: false })
      .eq("is_active", true)
      .neq("id", yearId);
  }
  const { error } = await supabase
    .from("academic_years")
    .update({
      name: year.name.trim(),
      start_date: year.startDate,
      end_date: year.endDate,
      is_active: year.isActive,
    })
    .eq("id", yearId);

  if (error) return { ok: false, error: mapAcademicYearMutationError(error) };
  revalidatePath("/academic-year");
  return { ok: true };
}
```

- [ ] **Step 4: Deprecate `updateYearWithSemesters` usage from edit dialog (Task 6)**

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/academic-years.ts src/lib/academic-year/form-validation.ts
git commit -m "feat: add delete academic year and simplify year create/update"
```

---

### Task 5: Generalize semester context types

**Files:**
- Modify: `src/lib/context/semester-params.ts`
- Modify: `src/lib/context/semester-params.test.ts`
- Modify: `src/lib/data/semesters.ts`
- Modify: `src/lib/data/semester-page-context.ts`

- [ ] **Step 1: Update types**

```typescript
export type SemesterOption = {
  id: string;
  academic_year_id: string;
  number: number;
  name: string | null;
};

export type SemesterContext = {
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  semesterNumber: number;
};

export function parseSemesterNumber(
  value: string | undefined,
  availableInYear: number[],
): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= 1 && availableInYear.includes(parsed)) {
    return parsed;
  }
  return availableInYear.length > 0 ? Math.min(...availableInYear) : 1;
}
```

- [ ] **Step 2: Update `resolveSemesterContext` to pass available numbers**

```typescript
const availableNumbers = semesters
  .filter((s) => s.academic_year_id === academicYearId)
  .map((s) => s.number)
  .sort((a, b) => a - b);

const semesterNumber = parseSemesterNumber(semesterParam, availableNumbers);
const semester = semesters.find(
  (s) => s.academic_year_id === academicYearId && s.number === semesterNumber,
);
```

- [ ] **Step 3: Extend tests — year with semesters 1 and 3, param `semester=3`**

- [ ] **Step 4: Remove `as 1 | 2` casts in `semesters.ts`**

- [ ] **Step 5: Run tests**

```bash
npm test -- src/lib/context/semester-params.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/context/ src/lib/data/semesters.ts src/lib/data/semester-page-context.ts
git commit -m "feat: generalize semester context for N semesters"
```

---

### Task 6: Dynamic year-semester header select

**Files:**
- Modify: `src/components/context/year-semester-select.tsx`
- Modify: `src/components/app-header.tsx` (types only if needed)

- [ ] **Step 1: Build semester items from `semesters` filtered by `selectedYearId`**

```typescript
const semesterItems = useMemo(() => {
  return semesters
    .filter((s) => s.academic_year_id === selectedYearId)
    .sort((a, b) => a.number - b.number)
    .map((s) => ({
      value: String(s.number),
      label: s.name ? `ภาค ${s.number} (${s.name})` : `ภาค ${s.number}`,
    }));
}, [semesters, selectedYearId]);
```

- [ ] **Step 2: On year change, navigate to lowest available semester number for that year**

- [ ] **Step 3: Commit**

```bash
git add src/components/context/year-semester-select.tsx
git commit -m "feat: dynamic semester list in header selector"
```

---

### Task 7: Academic year UI — table delete + semester editor

**Files:**
- Create: `src/components/academic-year/semester-list-editor.tsx`
- Modify: `src/components/academic-year/year-table.tsx`
- Modify: `src/components/academic-year/year-edit-dialog.tsx`
- Modify: `src/components/academic-year/year-wizard-dialog.tsx`

- [ ] **Step 1: `year-table.tsx` — semester summary column**

```typescript
function formatSemesters(year: AcademicYearRow) {
  const nums = year.semesters.map((s) => s.number).sort((a, b) => a - b);
  if (nums.length === 0) return "—";
  return `${nums.length} ภาค (${nums.join(", ")})`;
}
```

Add delete button with `AlertDialog` → `deleteAcademicYear(year.id)`; disable with tooltip when `year.is_active`.

- [ ] **Step 2: `semester-list-editor.tsx`**

Client component: map `year.semesters` sorted by `number`; each row shows number (read-only), name, dates, save via `updateSemester`, delete via `deleteSemester`; footer button `addSemester(academicYearId)`.

- [ ] **Step 3: `year-edit-dialog.tsx`**

- Save year section → `updateYearMetadata`
- Semester section → `<SemesterListEditor year={year} />`
- Remove hardcoded semester1/semester2 state

- [ ] **Step 4: `year-wizard-dialog.tsx`**

- Single semester form (semester 1 defaults from `defaultSemesterDates`)
- Help text: *เพิ่มภาคเรียนเพิ่มได้ภายหลังที่หน้าแก้ไข*
- `createYearWithSemesters(year, [sem1])` only

- [ ] **Step 5: Commit**

```bash
git add src/components/academic-year/
git commit -m "feat: academic year UI with dynamic semesters and delete"
```

---

### Task 8: Copy semester structure — any source

**Files:**
- Modify: `src/lib/actions/semester-structure.ts`
- Modify: `src/lib/data/semesters.ts`
- Modify: `src/components/registration/registration-panel.tsx`
- Modify: `src/app/(dashboard)/registration/page.tsx`

- [ ] **Step 1: Change action signature**

```typescript
export async function copySemesterStructure(
  sourceSemesterId: string,
  targetSemesterId: string,
): Promise<ActionState> {
  // same year check
  // target must have zero grades
  // copy from source grades → target (existing loop)
}
```

Remove `target.number !== 2` and hardcoded sem1 lookup.

- [ ] **Step 2: Add `listSemestersWithGradeLevels(academicYearId)` for copy dropdown**

Query semesters in year where `exists grade_levels`.

- [ ] **Step 3: Registration panel — Select source semester + copy button**

Show when `grades.length === 0` and at least one other semester has grades.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/semester-structure.ts src/lib/data/semesters.ts src/components/registration/ src/app/(dashboard)/registration/page.tsx
git commit -m "feat: copy grade structure from any source semester"
```

---

### Task 9: Final verification

**Files:** none

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: all pass

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: success

- [ ] **Step 3: Manual checklist (spec §7)**

- [ ] Add semesters 3, 4 — visible in header
- [ ] Delete empty semester — number gap preserved
- [ ] Delete semester with grades — blocked
- [ ] Delete active year — blocked
- [ ] Delete empty year — success
- [ ] Copy structure from chosen source semester

- [ ] **Step 4: Commit fixes if any**

```bash
git commit -m "chore: flexible semesters verification fixes"
```

---

## Plan self-review

| Spec section | Task |
|--------------|------|
| §2 Schema | Task 1 |
| §3 Delete eligibility | Task 2 |
| §4 Server actions | Task 3, 4 |
| §5 UI academic-year | Task 7 |
| §6 Context/header | Task 5, 6 |
| §6 Registration copy | Task 8 |
| §7 Testing | Task 2, 5, 9 |

No TBD placeholders. `SemesterOption.number` is `number` throughout Tasks 5–8.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-flexible-semesters-delete.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with executing-plans checkpoints

Which approach?
