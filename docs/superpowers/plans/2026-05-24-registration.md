# Registration System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build admin registration flows — grade/classroom setup per year and classroom-centric student enrollment with move/status actions.

**Architecture:** Server Components load data via `lib/data/*`; client islands (year select, 3-column panel, dialogs) call Server Actions in `lib/actions/*` with `requireAdminAction()` and `revalidatePath`. Pure validation in `lib/enrollment/*` with Vitest. No new DB migration for v1.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase SSR, shadcn/ui, Vitest, sonner

**Spec:** [2026-05-24-registration-design.md](../specs/2026-05-24-registration-design.md)

**React best practices (required before coding):** Read `vendor/react-best-practices/SKILL.md` and `vendor/react-best-practices/AGENTS.md` per `.cursor/skills/react-best-practices/SKILL.md`.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/enrollment/constants.ts` | Enrollment status labels (Thai) |
| `src/lib/enrollment/validation.ts` | Pure validation for names + status |
| `src/lib/enrollment/year-params.ts` | Parse/default `?year=` from searchParams |
| `src/lib/data/academic-years.ts` | Add `listAcademicYearOptions()` for dropdown |
| `src/lib/data/grade-levels.ts` | List grades by year |
| `src/lib/data/classrooms.ts` | List classrooms by grade + all by year (grouped) |
| `src/lib/data/enrollments.ts` | Roster, counts, students available to enroll |
| `src/lib/actions/grade-levels.ts` | CRUD grade levels |
| `src/lib/actions/classrooms.ts` | CRUD classrooms |
| `src/lib/actions/enrollments.ts` | enroll, move, updateStatus |
| `src/components/registration/year-select.tsx` | Client year dropdown → URL |
| `src/components/registration/setup-panel.tsx` | Master-detail grades + classrooms |
| `src/components/registration/registration-panel.tsx` | 3-column enroll UI |
| `src/components/registration/*-dialog.tsx` | Enroll / move / status dialogs |
| `src/app/(dashboard)/registration/setup/page.tsx` | Setup page |
| `src/app/(dashboard)/registration/page.tsx` | Enrollment page |
| `src/components/app-sidebar.tsx` | Registration nav group |

---

### Task 1: Enrollment constants and validation (TDD)

**Files:**
- Create: `src/lib/enrollment/constants.ts`
- Create: `src/lib/enrollment/validation.ts`
- Create: `src/lib/enrollment/validation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/enrollment/validation.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  isValidEnrollmentStatus,
  validateClassroomName,
  validateGradeLevelName,
} from "@/lib/enrollment/validation";

describe("validateGradeLevelName", () => {
  it("rejects empty name", () => {
    expect(validateGradeLevelName("  ")).toEqual({ ok: false, error: "กรุณากรอกชื่อชั้นเรียน" });
  });

  it("accepts non-empty name", () => {
    expect(validateGradeLevelName("ป.1")).toEqual({ ok: true });
  });
});

describe("validateClassroomName", () => {
  it("rejects empty name", () => {
    expect(validateClassroomName("")).toEqual({ ok: false, error: "กรุณากรอกชื่อห้องเรียน" });
  });
});

describe("isValidEnrollmentStatus", () => {
  it("allows enrolled transferred withdrawn", () => {
    expect(isValidEnrollmentStatus("enrolled")).toBe(true);
    expect(isValidEnrollmentStatus("transferred")).toBe(true);
    expect(isValidEnrollmentStatus("withdrawn")).toBe(true);
  });

  it("rejects other values", () => {
    expect(isValidEnrollmentStatus("active")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/lib/enrollment/validation.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement constants and validation**

`src/lib/enrollment/constants.ts`:

```typescript
export type EnrollmentStatus = "enrolled" | "transferred" | "withdrawn";

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  enrolled: "กำลังเรียน",
  transferred: "ย้ายออก",
  withdrawn: "ลาออก",
};

export const ENROLLMENT_STATUS_OPTIONS: { value: EnrollmentStatus; label: string }[] = [
  { value: "transferred", label: ENROLLMENT_STATUS_LABELS.transferred },
  { value: "withdrawn", label: ENROLLMENT_STATUS_LABELS.withdrawn },
];
```

`src/lib/enrollment/validation.ts`:

```typescript
import type { EnrollmentStatus } from "@/lib/enrollment/constants";

const ENROLLMENT_STATUSES: EnrollmentStatus[] = ["enrolled", "transferred", "withdrawn"];

export function validateGradeLevelName(name: string): { ok: true } | { ok: false; error: string } {
  if (!name.trim()) return { ok: false, error: "กรุณากรอกชื่อชั้นเรียน" };
  return { ok: true };
}

export function validateClassroomName(name: string): { ok: true } | { ok: false; error: string } {
  if (!name.trim()) return { ok: false, error: "กรุณากรอกชื่อห้องเรียน" };
  return { ok: true };
}

export function isValidEnrollmentStatus(value: string): value is EnrollmentStatus {
  return ENROLLMENT_STATUSES.includes(value as EnrollmentStatus);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/lib/enrollment/validation.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrollment/
git commit -m "test: add enrollment validation helpers"
```

---

### Task 2: Year options data + URL param helper

**Files:**
- Create: `src/lib/enrollment/year-params.ts`
- Create: `src/lib/enrollment/year-params.test.ts`
- Modify: `src/lib/data/academic-years.ts`

- [ ] **Step 1: Write failing test for year param resolution**

`src/lib/enrollment/year-params.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveSelectedYearId } from "@/lib/enrollment/year-params";

const years = [
  { id: "y-active", name: "2568", is_active: true },
  { id: "y-old", name: "2567", is_active: false },
];

describe("resolveSelectedYearId", () => {
  it("uses query param when valid", () => {
    expect(resolveSelectedYearId("y-old", years)).toBe("y-old");
  });

  it("falls back to active year", () => {
    expect(resolveSelectedYearId(undefined, years)).toBe("y-active");
  });

  it("falls back to first year when no active", () => {
    const onlyOld = [{ id: "y-old", name: "2567", is_active: false }];
    expect(resolveSelectedYearId(undefined, onlyOld)).toBe("y-old");
  });
});
```

- [ ] **Step 2: Implement `year-params.ts`**

```typescript
export type AcademicYearOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export function resolveSelectedYearId(
  yearParam: string | undefined,
  years: AcademicYearOption[],
): string | null {
  if (years.length === 0) return null;
  if (yearParam && years.some((y) => y.id === yearParam)) return yearParam;
  return years.find((y) => y.is_active)?.id ?? years[0].id;
}
```

- [ ] **Step 3: Add `listAcademicYearOptions` to `academic-years.ts`**

```typescript
export type AcademicYearOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export async function listAcademicYearOptions(): Promise<AcademicYearOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, name, is_active")
    .order("start_date", { ascending: false });
  if (error || !data) return [];
  return data;
}
```

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- src/lib/enrollment/year-params.test.ts
git add src/lib/enrollment/year-params.ts src/lib/enrollment/year-params.test.ts src/lib/data/academic-years.ts
git commit -m "feat: add academic year options and year param resolver"
```

---

### Task 3: Grade levels data layer + Server Actions

**Files:**
- Create: `src/lib/data/grade-levels.ts`
- Create: `src/lib/actions/grade-levels.ts`

- [ ] **Step 1: Create data layer**

```typescript
import { createClient } from "@/lib/supabase/server";

export type GradeLevelRow = {
  id: string;
  name: string;
  sort_order: number;
  academic_year_id: string;
};

export async function listGradeLevels(academicYearId: string): Promise<GradeLevelRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grade_levels")
    .select("id, name, sort_order, academic_year_id")
    .eq("academic_year_id", academicYearId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data;
}
```

- [ ] **Step 2: Create Server Actions**

`src/lib/actions/grade-levels.ts` — pattern from `src/lib/actions/students.ts`:

- `createGradeLevel(academicYearId, { name, sortOrder })`
- `updateGradeLevel(id, { name, sortOrder })`
- `deleteGradeLevel(id)` — before delete, count classrooms where `grade_level_id = id`; if > 0 return error `"ไม่สามารถลบได้ — มีห้องเรียนในชั้นนี้"`
- Also count enrollments via classrooms in that grade (join or two-step count)
- All use `requireAdminAction()`, `validateGradeLevelName`, `revalidatePath('/registration/setup')` and `revalidatePath('/registration')`

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/grade-levels.ts src/lib/actions/grade-levels.ts
git commit -m "feat: add grade levels data layer and actions"
```

---

### Task 4: Classrooms data layer + Server Actions

**Files:**
- Create: `src/lib/data/classrooms.ts`
- Create: `src/lib/actions/classrooms.ts`

- [ ] **Step 1: Create data layer**

```typescript
export type ClassroomRow = {
  id: string;
  name: string;
  grade_level_id: string;
  academic_year_id: string;
  enrolled_count?: number;
};

export async function listClassroomsByGrade(gradeLevelId: string): Promise<ClassroomRow[]> { /* ... */ }

export async function listClassroomsByYear(academicYearId: string): Promise<
  (ClassroomRow & { grade_name: string })[]
> {
  // select classrooms + grade_levels(name), order by grade sort_order, classroom name
}
```

For `enrolled_count` per classroom, either:
- separate query counting `student_enrollments` where `classroom_id` and `status = enrolled`, or
- compute in registration panel from roster query

Prefer `listClassroomsByGrade` returning count via Supabase:

```typescript
.select("id, name, grade_level_id, academic_year_id, student_enrollments(count)")
.eq("grade_level_id", gradeLevelId)
```

(filter count to enrolled only in app or use `.eq("student_enrollments.status", "enrolled")` in embed filter if supported)

- [ ] **Step 2: Create Server Actions**

- `createClassroom(academicYearId, gradeLevelId, { name })`
- `updateClassroom(id, { name })`
- `deleteClassroom(id)` — count enrollments for classroom; if > 0 error `"ไม่สามารถลบได้ — มีนักเรียนลงทะเบียนอยู่"`

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/classrooms.ts src/lib/actions/classrooms.ts
git commit -m "feat: add classrooms data layer and actions"
```

---

### Task 5: Enrollments data layer + Server Actions

**Files:**
- Modify: `src/lib/data/enrollments.ts` (keep `getStudentGradeMap`, add new exports)
- Create: `src/lib/actions/enrollments.ts`

- [ ] **Step 1: Add roster and available-students queries**

```typescript
export type EnrollmentRosterRow = {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  status: EnrollmentStatus;
};

export async function listClassroomRoster(classroomId: string): Promise<EnrollmentRosterRow[]> {
  // from student_enrollments
  // .eq("classroom_id", classroomId)
  // .eq("status", "enrolled")
  // join students fields
}

export async function listStudentsAvailableForEnrollment(
  academicYearId: string,
  query?: string,
): Promise<{ studentId: string; studentCode: string; name: string; hasNonEnrolledRow: boolean }[]> {
  // students.status = active
  // LEFT JOIN logic: no row for year OR status != enrolled
  // ilike search using buildStudentSearchOrFilter from src/lib/students/search.ts
}
```

- [ ] **Step 2: Create enrollment Server Actions**

`src/lib/actions/enrollments.ts`:

```typescript
"use server";

export type ActionState = { ok: true } | { ok: false; error: string };

export async function enrollStudent(
  studentId: string,
  classroomId: string,
): Promise<ActionState> {
  // requireAdminAction
  // load classroom → academic_year_id
  // upsert: if row exists for (student_id, academic_year_id) UPDATE else INSERT
  // set status enrolled, classroom_id, academic_year_id
  // revalidatePath /registration, /students
}

export async function moveStudentClassroom(
  enrollmentId: string,
  newClassroomId: string,
): Promise<ActionState> {
  // verify new classroom same academic_year_id as enrollment
  // UPDATE classroom_id WHERE id AND status = enrolled
}

export async function updateEnrollmentStatus(
  enrollmentId: string,
  status: "transferred" | "withdrawn",
): Promise<ActionState> {
  // isValidEnrollmentStatus
  // UPDATE status
}
```

Do **not** export `export type { ActionState }` re-export from this file (causes runtime error in `"use server"` modules).

- [ ] **Step 3: Update `student_enrollments.status` type in `src/lib/supabase/types.ts`**

```typescript
status: "enrolled" | "transferred" | "withdrawn";
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/enrollments.ts src/lib/actions/enrollments.ts src/lib/supabase/types.ts
git commit -m "feat: add enrollment roster queries and server actions"
```

---

### Task 6: Year select component + sidebar nav group

**Files:**
- Create: `src/components/registration/year-select.tsx`
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Create `year-select.tsx` (client)**

Props: `years: AcademicYearOption[]`, `selectedYearId: string`, `basePath: string` (`/registration` or `/registration/setup`)

On change: `router.push(\`${basePath}?year=${id}\`)` preserving other search params if needed.

- [ ] **Step 2: Update sidebar — registration group**

Replace single `{ href: "/registration", ...}` with:

```typescript
const registrationNav = [
  { href: "/registration/setup", label: "ตั้งค่าชั้น/ห้อง", icon: Settings2 },
  { href: "/registration", label: "ลงทะเบียนนักเรียน", icon: ClipboardList },
];
```

Update `NavSection` active logic: `pathname === item.href || pathname.startsWith(item.href + "/")` for registration routes.

Add third `NavSection` titled `"ลงทะเบียน"` with `registrationNav` between basic and finance.

- [ ] **Step 3: Commit**

```bash
git add src/components/registration/year-select.tsx src/components/app-sidebar.tsx
git commit -m "feat: add year select and registration sidebar group"
```

---

### Task 7: Registration setup page (`/registration/setup`)

**Files:**
- Create: `src/components/registration/setup-panel.tsx`
- Create: `src/components/registration/grade-level-dialog.tsx`
- Create: `src/components/registration/classroom-dialog.tsx`
- Create: `src/app/(dashboard)/registration/setup/page.tsx`

- [ ] **Step 1: Server page**

`setup/page.tsx`:

```typescript
export default async function RegistrationSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const [profile, years] = await Promise.all([
    getCurrentProfileRole(),
    listAcademicYearOptions(),
  ]);
  const selectedYearId = resolveSelectedYearId(sp.year, years);
  const grades = selectedYearId ? await listGradeLevels(selectedYearId) : [];
  const isAdmin = profile?.role === "admin";

  return (
    <>
      <AppHeader title="ตั้งค่าชั้น/ห้อง" ... />
      <main className="p-6">
        <SetupPanel
          years={years}
          selectedYearId={selectedYearId}
          grades={grades}
          isAdmin={isAdmin}
          initialGradeId={sp.grade}
        />
      </main>
    </>
  );
}
```

- [ ] **Step 2: `setup-panel.tsx` (client)**

- YearSelect at top
- Two columns: grade list (selectable) | classroom list for selected grade
- Dialogs for add/edit grade and classroom
- Inline `FieldError` on validation fail; toast on server errors
- Read-only when `!isAdmin`

- [ ] **Step 3: Manual smoke**

- Admin: add grade "ป.1", add classroom "1/1"
- Finance: page loads, no mutate buttons

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/registration/setup/ src/components/registration/setup-panel.tsx src/components/registration/grade-level-dialog.tsx src/components/registration/classroom-dialog.tsx
git commit -m "feat: add registration setup page for grades and classrooms"
```

---

### Task 8: Registration page shell + 3-column panel

**Files:**
- Modify: `src/app/(dashboard)/registration/page.tsx`
- Create: `src/components/registration/registration-panel.tsx`

- [ ] **Step 1: Server page loads hierarchy**

```typescript
// searchParams: year, grade, classroom
const selectedYearId = resolveSelectedYearId(sp.year, years);
const grades = selectedYearId ? await listGradeLevels(selectedYearId) : [];
const selectedGradeId = grades.some((g) => g.id === sp.grade) ? sp.grade : grades[0]?.id ?? null;
const classrooms = selectedGradeId ? await listClassroomsByGrade(selectedGradeId) : [];
const selectedClassroomId = classrooms.some((c) => c.id === sp.classroom) ? sp.classroom : classrooms[0]?.id ?? null;
const roster = selectedClassroomId ? await listClassroomRoster(selectedClassroomId) : [];
```

- [ ] **Step 2: `registration-panel.tsx` (client)**

Three columns:
1. Grade list — click sets `?year=&grade=` (clear classroom)
2. Classroom list — shows enrolled count badge
3. Roster table + action buttons (admin)

URL updates via `router.push` on selection.

Empty states per spec (link to setup if no grades).

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/registration/page.tsx src/components/registration/registration-panel.tsx
git commit -m "feat: add registration page with grade/classroom/roster layout"
```

---

### Task 9: Enroll student dialog

**Files:**
- Create: `src/components/registration/enroll-student-dialog.tsx`

- [ ] **Step 1: Dialog UI**

- Opens from registration panel "+ เพิ่มนักเรียน"
- Search input with debounce (ref + timeout pattern from `student-search-input.tsx`, not useEffect)
- Call server action wrapper or pass preloaded list — for v1 use client fetch via small Server Action `searchStudentsForEnrollment(yearId, q)` in `enrollments.ts` actions file OR load initial 50 available students server-side

Recommended: add to `src/lib/actions/enrollments.ts`:

```typescript
export async function searchStudentsForEnrollment(
  academicYearId: string,
  query: string,
): Promise<{ id: string; studentCode: string; name: string }[]> {
  const auth = await requireAdminAction();
  if (!auth.ok) return [];
  return listStudentsAvailableForEnrollment(academicYearId, query);
}
```

- [ ] **Step 2: On select student → `enrollStudent(studentId, classroomId)`**

- [ ] **Step 3: Commit**

```bash
git add src/components/registration/enroll-student-dialog.tsx src/lib/actions/enrollments.ts
git commit -m "feat: add enroll student dialog"
```

---

### Task 10: Move classroom + change status dialogs

**Files:**
- Create: `src/components/registration/move-classroom-dialog.tsx`
- Create: `src/components/registration/enrollment-status-dialog.tsx`

- [ ] **Step 1: Move dialog**

- Props: enrollmentId, currentClassroomId, classroomsGroupedByGrade (from server)
- Select new classroom → `moveStudentClassroom`
- Validate target !== current

- [ ] **Step 2: Status dialog**

- Radio/select: transferred | withdrawn
- `updateEnrollmentStatus`
- Confirm copy in Thai

- [ ] **Step 3: Wire row actions in registration-panel**

- [ ] **Step 4: Commit**

```bash
git add src/components/registration/move-classroom-dialog.tsx src/components/registration/enrollment-status-dialog.tsx src/components/registration/registration-panel.tsx
git commit -m "feat: add move and status dialogs for enrollment"
```

---

### Task 11: Final verification

**Files:** none (verification only)

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

- [ ] **Step 3: Manual checklist (spec §10)**

- [ ] สร้างชั้น + ห้องในปี 2568
- [ ] เลือกปีจาก dropdown
- [ ] เพิ่มนักเรียนเข้าห้อง → แสดงใน roster
- [ ] ย้ายห้อง
- [ ] เปลี่ยนสถานะ withdrawn → หายจาก roster
- [ ] กลับมาเรียนผ่าน enroll dialog
- [ ] ลบห้องที่มีนักเรียน → error
- [ ] Finance อ่านได้ ไม่เห็นปุ่มแก้ไข
- [ ] `/students` คอลัมน์ชั้นอัปเดต

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "chore: registration feature verification fixes"
```

---

## Plan self-review

| Spec section | Task |
|--------------|------|
| §5 Setup page | Task 7 |
| §6 Registration page | Tasks 8–10 |
| Year dropdown + URL | Tasks 2, 6 |
| enroll / move / status actions | Task 5, 10 |
| Admin-only mutate | All action files use `requireAdminAction` |
| Inline validation + toast | Tasks 7, 9, 10 |
| Vitest validation | Task 1 |
| Sidebar group | Task 6 |
| Out of scope (bulk, teachers) | Not in plan ✓ |

No TBD placeholders. Types consistent: `EnrollmentStatus`, `ActionState` per actions file.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-registration.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with executing-plans, batch checkpoints

Which approach?
