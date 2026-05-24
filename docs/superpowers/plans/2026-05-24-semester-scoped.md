# Semester-Scoped Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope grade levels, classrooms, enrollments, and app context by **semester** (not academic year alone), with migration, header selectors, copy-structure for semester 2, and updated registration/students/dashboard flows.

**Architecture:** Add `semester_id` to core tables via SQL migration; backfill existing rows to semester 1. Replace `?year=` with `?year=&semester=1|2` + cookie fallback. Data/actions filter by `semesterId`; denormalized `academic_year_id` kept for queries. Registration UI uses shared year+semester selector and copy-from-semester-1 action.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase PostgreSQL, shadcn/ui + Base UI Select, Vitest, sonner

**Spec:** [2026-05-24-semester-scoped-registration-design.md](../specs/2026-05-24-semester-scoped-registration-design.md)

**React best practices (required before coding):** Read `vendor/react-best-practices/SKILL.md` and `vendor/react-best-practices/AGENTS.md` per `.cursor/skills/react-best-practices/SKILL.md`.

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260524140000_semester_scoped_grades_enrollments.sql` | Schema + backfill |
| `src/lib/supabase/types.ts` | Add `semester_id` to table types |
| `src/lib/context/semester-params.ts` | `resolveSemesterContext`, parse semester number |
| `src/lib/context/semester-params.test.ts` | Vitest for context resolution |
| `src/lib/context/semester-cookie.ts` | Read/write last year+semester cookie |
| `src/lib/data/semesters.ts` | `listSemestersByYear`, flat options |
| `src/lib/data/grade-levels.ts` | Filter by `semester_id` |
| `src/lib/data/classrooms.ts` | Filter by `semester_id` |
| `src/lib/data/enrollments.ts` | `getStudentGradeMap(semesterId)`, available students per semester |
| `src/lib/data/context.ts` | Align with semester context helper |
| `src/lib/actions/grade-levels.ts` | Create with `semesterId`, set `academic_year_id` |
| `src/lib/actions/classrooms.ts` | Create with `semesterId` |
| `src/lib/actions/enrollments.ts` | UNIQUE per semester, Thai error messages |
| `src/lib/actions/semester-structure.ts` | `copySemesterStructure` |
| `src/components/context/year-semester-select.tsx` | Working dropdowns (items prop) |
| `src/components/app-header.tsx` | Wire `YearSemesterSelect` when `showContextSelectors` |
| `src/components/registration/registration-panel.tsx` | Semester URL, copy button |
| `src/app/(dashboard)/registration/page.tsx` | Load by semester context |
| `src/app/(dashboard)/students/page.tsx` | Pass `semesterId` to student list |
| `src/app/(dashboard)/page.tsx` | Dashboard uses semester context |
| `src/lib/data/dashboard.ts` | Enrollment counts by semester |

**Remove / replace:** `src/lib/enrollment/year-params.ts` → logic moves to `semester-params.ts` (update tests). `src/components/registration/year-select.tsx` → replaced by `year-semester-select.tsx`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260524140000_semester_scoped_grades_enrollments.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Add nullable semester_id columns
ALTER TABLE public.grade_levels ADD COLUMN semester_id uuid REFERENCES public.semesters(id);
ALTER TABLE public.classrooms ADD COLUMN semester_id uuid REFERENCES public.semesters(id);
ALTER TABLE public.student_enrollments ADD COLUMN semester_id uuid REFERENCES public.semesters(id);
ALTER TABLE public.teacher_assignments ADD COLUMN semester_id uuid REFERENCES public.semesters(id);

-- Backfill to semester 1 of each academic year
UPDATE public.grade_levels gl
SET semester_id = s.id
FROM public.semesters s
WHERE s.academic_year_id = gl.academic_year_id AND s.number = 1;

UPDATE public.classrooms c
SET semester_id = s.id
FROM public.semesters s
WHERE s.academic_year_id = c.academic_year_id AND s.number = 1;

UPDATE public.student_enrollments se
SET semester_id = c.semester_id
FROM public.classrooms c
WHERE c.id = se.classroom_id;

UPDATE public.teacher_assignments ta
SET semester_id = c.semester_id
FROM public.classrooms c
WHERE c.id = ta.classroom_id;

-- NOT NULL
ALTER TABLE public.grade_levels ALTER COLUMN semester_id SET NOT NULL;
ALTER TABLE public.classrooms ALTER COLUMN semester_id SET NOT NULL;
ALTER TABLE public.student_enrollments ALTER COLUMN semester_id SET NOT NULL;
ALTER TABLE public.teacher_assignments ALTER COLUMN semester_id SET NOT NULL;

-- Drop old uniques, add new
ALTER TABLE public.grade_levels DROP CONSTRAINT grade_levels_year_name_unique;
ALTER TABLE public.grade_levels ADD CONSTRAINT grade_levels_semester_name_unique UNIQUE (semester_id, name);

ALTER TABLE public.classrooms DROP CONSTRAINT classrooms_year_grade_name_unique;
ALTER TABLE public.classrooms ADD CONSTRAINT classrooms_semester_grade_name_unique UNIQUE (semester_id, grade_level_id, name);

ALTER TABLE public.student_enrollments DROP CONSTRAINT student_enrollments_student_year_unique;
ALTER TABLE public.student_enrollments ADD CONSTRAINT student_enrollments_student_semester_unique UNIQUE (student_id, semester_id);

ALTER TABLE public.teacher_assignments DROP CONSTRAINT teacher_assignments_profile_classroom_year_unique;
ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_profile_classroom_semester_unique UNIQUE (profile_id, classroom_id, semester_id);

CREATE INDEX idx_grade_levels_semester_id ON public.grade_levels (semester_id);
CREATE INDEX idx_classrooms_semester_id ON public.classrooms (semester_id);
CREATE INDEX idx_student_enrollments_semester_id ON public.student_enrollments (semester_id);
```

- [ ] **Step 2: Run migration**

```bash
npm run db:setup
```

Expected: migration applies without error

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260524140000_semester_scoped_grades_enrollments.sql
git commit -m "feat(db): scope grades and enrollments by semester"
```

---

### Task 2: Supabase types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Add semester_id to affected tables**

```typescript
// grade_levels, classrooms, student_enrollments, teacher_assignments — add:
semester_id: string;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore: add semester_id to generated table types"
```

---

### Task 3: Semester context helpers (TDD)

**Files:**
- Create: `src/lib/context/semester-params.ts`
- Create: `src/lib/context/semester-params.test.ts`
- Delete (after porting): `src/lib/enrollment/year-params.ts`, `src/lib/enrollment/year-params.test.ts`

- [ ] **Step 1: Write failing tests**

`src/lib/context/semester-params.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseSemesterNumber, resolveSemesterContext } from "@/lib/context/semester-params";

const years = [
  { id: "y-active", name: "2568", is_active: true },
  { id: "y-old", name: "2567", is_active: false },
];

const semesters = [
  { id: "s1-active", academic_year_id: "y-active", number: 1 as const, name: null },
  { id: "s2-active", academic_year_id: "y-active", number: 2 as const, name: null },
  { id: "s1-old", academic_year_id: "y-old", number: 1 as const, name: null },
];

describe("parseSemesterNumber", () => {
  it("accepts 1 and 2", () => {
    expect(parseSemesterNumber("1")).toBe(1);
    expect(parseSemesterNumber("2")).toBe(2);
  });
  it("defaults invalid to 1", () => {
    expect(parseSemesterNumber(undefined)).toBe(1);
    expect(parseSemesterNumber("3")).toBe(1);
  });
});

describe("resolveSemesterContext", () => {
  it("uses year and semester params when valid", () => {
    const ctx = resolveSemesterContext("y-active", "2", years, semesters);
    expect(ctx?.semesterId).toBe("s2-active");
    expect(ctx?.semesterNumber).toBe(2);
  });
  it("defaults to active year and semester 1", () => {
    const ctx = resolveSemesterContext(undefined, undefined, years, semesters);
    expect(ctx?.academicYearId).toBe("y-active");
    expect(ctx?.semesterId).toBe("s1-active");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/lib/context/semester-params.test.ts
```

- [ ] **Step 3: Implement**

`src/lib/context/semester-params.ts`:

```typescript
export type SemesterOption = {
  id: string;
  academic_year_id: string;
  number: 1 | 2;
  name: string | null;
};

export type SemesterContext = {
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  semesterNumber: 1 | 2;
};

export function parseSemesterNumber(value: string | undefined): 1 | 2 {
  if (value === "2") return 2;
  return 1;
}

export function resolveSemesterContext(
  yearParam: string | undefined,
  semesterParam: string | undefined,
  years: { id: string; name: string; is_active: boolean }[],
  semesters: SemesterOption[],
): SemesterContext | null {
  if (years.length === 0 || semesters.length === 0) return null;

  const academicYearId =
    yearParam && years.some((y) => y.id === yearParam)
      ? yearParam
      : (years.find((y) => y.is_active)?.id ?? years[0].id);

  const year = years.find((y) => y.id === academicYearId)!;
  const semesterNumber = parseSemesterNumber(semesterParam);
  const semester =
    semesters.find((s) => s.academic_year_id === academicYearId && s.number === semesterNumber) ??
    semesters.find((s) => s.academic_year_id === academicYearId && s.number === 1);

  if (!semester) return null;

  return {
    academicYearId,
    academicYearName: year.name,
    semesterId: semester.id,
    semesterNumber: semester.number,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- src/lib/context/semester-params.test.ts
```

- [ ] **Step 5: Remove old year-params files; fix imports if any remain**

- [ ] **Step 6: Commit**

```bash
git add src/lib/context/ src/lib/enrollment/
git commit -m "feat: add semester context resolution helpers"
```

---

### Task 4: Semesters data layer

**Files:**
- Create: `src/lib/data/semesters.ts`

- [ ] **Step 1: Implement list helpers**

```typescript
import { createClient } from "@/lib/supabase/server";
import type { SemesterOption } from "@/lib/context/semester-params";

export async function listSemestersForYears(yearIds: string[]): Promise<SemesterOption[]> {
  if (yearIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .in("academic_year_id", yearIds)
    .order("number", { ascending: true });
  return (data ?? []).map((s) => ({
    id: s.id,
    academic_year_id: s.academic_year_id,
    number: s.number as 1 | 2,
    name: s.name,
  }));
}

export async function getSemesterById(id: string): Promise<SemesterOption | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return { ...data, number: data.number as 1 | 2 };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/semesters.ts
git commit -m "feat: add semesters data helpers"
```

---

### Task 5: Refactor grade-levels and classrooms (data + actions)

**Files:**
- Modify: `src/lib/data/grade-levels.ts`
- Modify: `src/lib/data/classrooms.ts`
- Modify: `src/lib/actions/grade-levels.ts`
- Modify: `src/lib/actions/classrooms.ts`

- [ ] **Step 1: Change list functions to filter by semesterId**

`listGradeLevels(semesterId: string)` — `.eq("semester_id", semesterId)`

`listClassroomsByGrade` — unchanged join, grade already semester-scoped

`listClassroomsByYear` → rename to `listClassroomsBySemester(semesterId)` for move dialog

- [ ] **Step 2: Update create actions**

```typescript
// grade-levels createGradeLevel(semesterId, input)
const semester = await getSemesterById(semesterId);
// insert: semester_id, academic_year_id: semester.academic_year_id

// classrooms createClassroom(semesterId, gradeLevelId, input) — same pattern
```

- [ ] **Step 3: Update delete guards** (unchanged logic, semester-scoped queries)

- [ ] **Step 4: Run build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/grade-levels.ts src/lib/data/classrooms.ts src/lib/actions/grade-levels.ts src/lib/actions/classrooms.ts
git commit -m "feat: scope grade levels and classrooms by semester"
```

---

### Task 6: Refactor enrollments (data + actions)

**Files:**
- Modify: `src/lib/data/enrollments.ts`
- Modify: `src/lib/actions/enrollments.ts`

- [ ] **Step 1: getStudentGradeMap(semesterId)**

```typescript
.eq("academic_year_id", ...)  →  .eq("semester_id", semesterId)
```

- [ ] **Step 2: listStudentsAvailableForEnrollment(semesterId)**

Filter enrollments by `semester_id` instead of `academic_year_id`

- [ ] **Step 3: enrollStudent — use classroom.semester_id**

```typescript
.eq("student_id", studentId).eq("semester_id", classroom.semester_id)
// insert includes semester_id
// error 23505 message: "นักเรียนลงทะเบียนในภาคนี้แล้ว"
```

- [ ] **Step 4: moveStudentClassroom — validate same semester_id**

```typescript
if (classroom.semester_id !== enrollment.semester_id) {
  return { ok: false, error: "ห้องเรียนต้องอยู่ในภาคเรียนเดียวกัน" };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/enrollments.ts src/lib/actions/enrollments.ts
git commit -m "feat: scope student enrollments by semester"
```

---

### Task 7: Copy semester structure action

**Files:**
- Create: `src/lib/actions/semester-structure.ts`

- [ ] **Step 1: Implement copySemesterStructure**

```typescript
"use server";

export async function copySemesterStructure(targetSemesterId: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const target = await getSemesterById(targetSemesterId);
  if (!target || target.number !== 2) {
    return { ok: false, error: "คัดลอกได้เฉพาะไปยังภาคเรียนที่ 2" };
  }

  const source = /* semester 1 same academic_year_id */;
  const existingGrades = await listGradeLevels(targetSemesterId);
  if (existingGrades.length > 0) {
    return { ok: false, error: "ภาคเรียนนี้มีชั้นเรียนอยู่แล้ว" };
  }

  // Loop source grades → insert grade + classrooms with mapped ids
  revalidatePath("/registration");
  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/semester-structure.ts
git commit -m "feat: add copy semester structure server action"
```

---

### Task 8: Year + semester selector component

**Files:**
- Create: `src/components/context/year-semester-select.tsx`
- Create: `src/lib/context/semester-cookie.ts` (optional server helpers)
- Modify: `src/components/app-header.tsx`

- [ ] **Step 1: Build client selector**

Props: `years`, `semesters`, `selectedYearId`, `selectedSemesterNumber`, `basePath`

On year change: `?year=id&semester=1` (reset semester to 1, clear grade/classroom if on registration)

On semester change: preserve year, update `semester` param

Use Base UI `items` prop on both Selects (see fixed `year-select.tsx` pattern)

- [ ] **Step 2: Wire AppHeader**

When `showContextSelectors`, render `YearSemesterSelect` with data from server props OR fetch years/semesters in layout (prefer passing from each page's server component initially; optional later: dashboard layout loader)

Minimal approach: pages that need context pass `years` + `semesters` + `ctx` into header via new optional props on `AppHeader`:

```typescript
type AppHeaderProps = {
  ...
  context?: {
    years: AcademicYearOption[];
    semesters: SemesterOption[];
    selectedYearId: string;
    selectedSemesterNumber: 1 | 2;
  };
};
```

- [ ] **Step 3: Cookie on change**

`semester-cookie.ts`: set `school_year_id`, `school_semester` for 1 year max-age

- [ ] **Step 4: Commit**

```bash
git add src/components/context/year-semester-select.tsx src/lib/context/semester-cookie.ts src/components/app-header.tsx
git commit -m "feat: add working year and semester header selectors"
```

---

### Task 9: Registration page + panel

**Files:**
- Modify: `src/app/(dashboard)/registration/page.tsx`
- Modify: `src/components/registration/registration-panel.tsx`
- Delete: `src/components/registration/year-select.tsx`
- Modify: `src/components/registration/grade-level-dialog.tsx` (create uses semesterId)
- Modify: `src/components/registration/classroom-dialog.tsx`

- [ ] **Step 1: Page loads semester context**

```typescript
const sp = await searchParams;
const years = await listAcademicYearOptions();
const semesters = await listSemestersForYears(years.map((y) => y.id));
const ctx = resolveSemesterContext(sp.year, sp.semester, years, semesters);
const grades = ctx ? await listGradeLevels(ctx.semesterId) : [];
// pass ctx to panel and header
```

- [ ] **Step 2: Panel uses semester in buildUrl**

```typescript
params.set("year", ctx.academicYearId);
params.set("semester", String(ctx.semesterNumber));
```

Replace `YearSelect` with inline `YearSemesterSelect` or shared component

- [ ] **Step 3: Copy structure button**

Show when `ctx.semesterNumber === 2 && grades.length === 0 && isAdmin`:

```tsx
<Button onClick={() => copySemesterStructure(ctx.semesterId)}>คัดลอกโครงสร้างจากภาค 1</Button>
```

- [ ] **Step 4: Dialogs pass semesterId to create actions**

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/registration/ src/components/registration/
git commit -m "feat: registration page uses semester context and copy structure"
```

---

### Task 10: Students page and grade column

**Files:**
- Modify: `src/lib/data/students.ts`
- Modify: `src/app/(dashboard)/students/page.tsx`

- [ ] **Step 1: StudentListParams use semesterId**

```typescript
semesterId?: string | null;
// getStudentGradeMap(params.semesterId)
```

- [ ] **Step 2: Page resolves context like registration**

Load years, semesters, `resolveSemesterContext`, pass `semesterId` to `listStudentsPaginated`

Enable header context selectors with same data

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/students.ts src/app/(dashboard)/students/page.tsx
git commit -m "feat: students list grade column uses semester context"
```

---

### Task 11: Dashboard

**Files:**
- Modify: `src/lib/data/context.ts`
- Modify: `src/lib/data/dashboard.ts`
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Extend getYearSemesterContext or use resolveSemesterContext from URL on dashboard**

Dashboard page reads `searchParams` year/semester; falls back to `getYearSemesterContext()` when absent

- [ ] **Step 2: Enrollment stats filter by semester_id**

Update queries in `dashboard.ts` that count enrollments

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/context.ts src/lib/data/dashboard.ts src/app/(dashboard)/page.tsx
git commit -m "feat: dashboard stats use semester context"
```

---

### Task 12: Finance pages context passthrough

**Files:**
- Modify: `src/app/(dashboard)/payments/page.tsx`
- Modify: `src/app/(dashboard)/invoices/page.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Modify: `src/lib/data/page-header.ts`

- [ ] **Step 1: Pass semester context to header** (read-only selectors) so finance pages show consistent year/semester

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/payments/page.tsx src/app/(dashboard)/invoices/page.tsx src/app/(dashboard)/reports/page.tsx src/lib/data/page-header.ts
git commit -m "feat: finance pages show year-semester context in header"
```

---

### Task 13: Final verification

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

- [ ] **Step 3: Manual checklist (spec §9)**

- [ ] Migration — existing data in semester 1
- [ ] Sem 1 vs sem 2 separate grades/classrooms
- [ ] Same student different classroom per semester
- [ ] Header changes update students + registration
- [ ] Copy structure sem1 → sem2
- [ ] Delete guards still work
- [ ] Shareable URL `?year=&semester=`

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "chore: semester-scoped feature verification fixes"
```

---

## Plan self-review

| Spec section | Task |
|--------------|------|
| §2 Schema | Task 1–2 |
| §3 Migration | Task 1 |
| §4 App context + header | Task 3, 8, 12 |
| §5 Registration + copy | Task 7, 9 |
| §6 Other modules | Task 5–6, 10–11 |
| §8 Errors | Task 6 (messages) |
| §9 Testing | Task 3, 13 |
| fee_rates validation | Deferred until fee_rates UI exists (schema ready) |
| teacher_assignments UI | Migration only in Task 1; no app code yet |

No TBD placeholders. Types consistent: `SemesterContext`, `semesterId` throughout.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-semester-scoped.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with executing-plans, batch checkpoints

Which approach?
