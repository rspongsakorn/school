# Copy Semester Structure With Students — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second option to the registration "copy structure" flow so an admin can copy a semester's grades/classrooms *and* carry forward each room's currently-enrolled students into the matching room of the target semester.

**Architecture:** Extract the enrollment-row construction into a pure, unit-tested helper. Extend the existing `copySemesterStructure` server action to (a) capture a source-classroom-id → target-classroom-id map while it creates the structure, and (b) when `includeStudents` is true, batch-read enrolled students and batch-insert carry-forward enrollments via the helper. Update the registration panel to show two separate buttons.

**Tech Stack:** Next.js server actions, Supabase JS client, Vitest (pure-logic unit tests — matching the repo's existing pattern of testing extracted helpers rather than mocking Supabase), React + TanStack Query UI.

---

### Task 1: Pure helper to build carry-forward enrollment rows

The repo tests pure helpers (see `src/lib/enrollment/enrollment-delete-eligibility.ts` + its `.test.ts`), not Supabase-backed actions. So the testable unit is the transformation: given source enrollments and a source→target classroom id map, produce the rows to insert.

**Files:**
- Create: `src/lib/enrollment/carry-forward.ts`
- Test: `src/lib/enrollment/carry-forward.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/enrollment/carry-forward.test.ts
import { describe, expect, it } from "vitest";
import { buildCarryForwardEnrollments } from "./carry-forward";

describe("buildCarryForwardEnrollments", () => {
  const base = {
    targetSemesterId: "sem2",
    targetAcademicYearId: "year1",
  };

  it("maps each source enrollment to the matching target classroom", () => {
    const rows = buildCarryForwardEnrollments({
      ...base,
      sourceEnrollments: [
        { student_id: "s1", classroom_id: "srcA" },
        { student_id: "s2", classroom_id: "srcB" },
      ],
      targetClassroomBySource: new Map([
        ["srcA", "dstA"],
        ["srcB", "dstB"],
      ]),
    });

    expect(rows).toEqual([
      {
        student_id: "s1",
        classroom_id: "dstA",
        academic_year_id: "year1",
        semester_id: "sem2",
        status: "enrolled",
      },
      {
        student_id: "s2",
        classroom_id: "dstB",
        academic_year_id: "year1",
        semester_id: "sem2",
        status: "enrolled",
      },
    ]);
  });

  it("skips enrollments whose source classroom has no target mapping", () => {
    const rows = buildCarryForwardEnrollments({
      ...base,
      sourceEnrollments: [
        { student_id: "s1", classroom_id: "srcA" },
        { student_id: "s2", classroom_id: "orphan" },
      ],
      targetClassroomBySource: new Map([["srcA", "dstA"]]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ student_id: "s1", classroom_id: "dstA" });
  });

  it("returns an empty array when there are no source enrollments", () => {
    const rows = buildCarryForwardEnrollments({
      ...base,
      sourceEnrollments: [],
      targetClassroomBySource: new Map([["srcA", "dstA"]]),
    });
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/enrollment/carry-forward.test.ts`
Expected: FAIL — `buildCarryForwardEnrollments` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/enrollment/carry-forward.ts
export type SourceEnrollment = {
  student_id: string;
  classroom_id: string;
};

export type CarryForwardRow = {
  student_id: string;
  classroom_id: string;
  academic_year_id: string;
  semester_id: string;
  status: "enrolled";
};

export function buildCarryForwardEnrollments(input: {
  sourceEnrollments: SourceEnrollment[];
  targetClassroomBySource: Map<string, string>;
  targetSemesterId: string;
  targetAcademicYearId: string;
}): CarryForwardRow[] {
  const { sourceEnrollments, targetClassroomBySource, targetSemesterId, targetAcademicYearId } =
    input;

  const rows: CarryForwardRow[] = [];
  for (const enrollment of sourceEnrollments) {
    const targetClassroomId = targetClassroomBySource.get(enrollment.classroom_id);
    if (!targetClassroomId) continue;
    rows.push({
      student_id: enrollment.student_id,
      classroom_id: targetClassroomId,
      academic_year_id: targetAcademicYearId,
      semester_id: targetSemesterId,
      status: "enrolled",
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/enrollment/carry-forward.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrollment/carry-forward.ts src/lib/enrollment/carry-forward.test.ts
git commit -m "feat(enrollment): pure helper to build carry-forward enrollment rows"
```

---

### Task 2: Extend `copySemesterStructure` to optionally carry students

Add the `includeStudents` parameter, build the source→target classroom map while creating rooms, and (when requested) batch-read enrolled students and batch-insert carry-forward rows. Return an `enrolledCount`.

**Files:**
- Modify: `src/lib/actions/semester-structure.ts` (whole file — current version copies grades/classrooms only)

- [ ] **Step 1: Replace the action with the extended version**

Replace the entire contents of `src/lib/actions/semester-structure.ts` with:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { listClassroomsByGrade } from "@/lib/data/classrooms";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { getSemesterById } from "@/lib/data/semesters";
import { buildCarryForwardEnrollments } from "@/lib/enrollment/carry-forward";
import { createClient } from "@/lib/supabase/server";

export type CopyStructureResult =
  | { ok: true; enrolledCount: number }
  | { ok: false; error: string };

function revalidateRegistrationPaths() {
  revalidatePath("/registration");
  revalidatePath("/students");
}

export async function copySemesterStructure(
  sourceSemesterId: string,
  targetSemesterId: string,
  includeStudents = false,
): Promise<CopyStructureResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const [source, target] = await Promise.all([
    getSemesterById(sourceSemesterId),
    getSemesterById(targetSemesterId),
  ]);

  if (!source) return { ok: false, error: "ไม่พบภาคเรียนต้นทาง" };
  if (!target) return { ok: false, error: "ไม่พบภาคเรียนปลายทาง" };

  if (source.academic_year_id !== target.academic_year_id) {
    return { ok: false, error: "คัดลอกได้เฉพาะภายในปีการศึกษาเดียวกัน" };
  }

  if (source.id === target.id) {
    return { ok: false, error: "ไม่สามารถคัดลอกไปยังภาคเรียนเดียวกันได้" };
  }

  const existingGrades = await listGradeLevels(targetSemesterId);
  if (existingGrades.length > 0) {
    return { ok: false, error: "ภาคเรียนนี้มีชั้นเรียนอยู่แล้ว" };
  }

  const sourceGrades = await listGradeLevels(sourceSemesterId);
  if (sourceGrades.length === 0) {
    return { ok: false, error: "ภาคเรียนต้นทางยังไม่มีชั้นเรียน" };
  }

  const supabase = await createClient();

  // source classroom id -> target classroom id (filled while creating structure)
  const targetClassroomBySource = new Map<string, string>();

  for (const grade of sourceGrades) {
    const { data: newGrade, error: gradeError } = await supabase
      .from("grade_levels")
      .insert({
        semester_id: targetSemesterId,
        academic_year_id: target.academic_year_id,
        name: grade.name,
        sort_order: grade.sort_order,
      })
      .select("id")
      .single();

    if (gradeError || !newGrade) {
      return { ok: false, error: "ไม่สามารถคัดลอกชั้นเรียนได้" };
    }

    const sourceClassrooms = await listClassroomsByGrade(grade.id);
    if (sourceClassrooms.length === 0) continue;

    const { data: insertedClassrooms, error: classroomError } = await supabase
      .from("classrooms")
      .insert(
        sourceClassrooms.map((classroom) => ({
          semester_id: targetSemesterId,
          academic_year_id: target.academic_year_id,
          grade_level_id: newGrade.id,
          name: classroom.name,
        })),
      )
      .select("id, name");

    if (classroomError || !insertedClassrooms) {
      return { ok: false, error: "ไม่สามารถคัดลอกห้องเรียนได้" };
    }

    const targetIdByName = new Map(insertedClassrooms.map((c) => [c.name, c.id]));
    for (const sourceClassroom of sourceClassrooms) {
      const targetId = targetIdByName.get(sourceClassroom.name);
      if (targetId) targetClassroomBySource.set(sourceClassroom.id, targetId);
    }
  }

  let enrolledCount = 0;

  if (includeStudents && targetClassroomBySource.size > 0) {
    const sourceClassroomIds = [...targetClassroomBySource.keys()];
    const { data: sourceEnrollments, error: enrollmentReadError } = await supabase
      .from("student_enrollments")
      .select("student_id, classroom_id")
      .eq("status", "enrolled")
      .in("classroom_id", sourceClassroomIds);

    if (enrollmentReadError) {
      return { ok: false, error: "ไม่สามารถอ่านรายชื่อนักเรียนต้นทางได้" };
    }

    const rows = buildCarryForwardEnrollments({
      sourceEnrollments: sourceEnrollments ?? [],
      targetClassroomBySource,
      targetSemesterId,
      targetAcademicYearId: target.academic_year_id,
    });

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("student_enrollments").insert(rows);
      if (insertError) {
        return { ok: false, error: "ไม่สามารถลงทะเบียนนักเรียนได้" };
      }
      enrolledCount = rows.length;
    }
  }

  revalidateRegistrationPaths();
  return { ok: true, enrolledCount };
}
```

- [ ] **Step 2: Typecheck and lint the changed file**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors). Note `requireAdminAction()` returns an `ActionState` whose failure shape `{ ok: false; error: string }` is assignable to `CopyStructureResult`.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite (helper still green)**

Run: `npm test`
Expected: PASS, including `carry-forward.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/semester-structure.ts
git commit -m "feat(registration): copySemesterStructure can carry forward enrolled students"
```

---

### Task 3: Two-button UI in the registration panel

Replace the single copy button with two buttons. "คัดลอกพร้อมนักเรียน" confirms before running and reports the enrolled count. Drop the "(ไม่รวมนักเรียน)" wording from the hint.

**Files:**
- Modify: `src/components/registration/registration-panel.tsx`
  - hint text at line ~280
  - `handleCopyStructure` at lines ~234-249
  - the copy button block at lines ~298-307

- [ ] **Step 1: Generalize the copy handler**

In `src/components/registration/registration-panel.tsx`, replace the existing `handleCopyStructure` function (currently lines ~234-249):

```typescript
  function handleCopyStructure() {
    if (!copySourceId) {
      toast.error("กรุณาเลือกภาคเรียนต้นทาง");
      return;
    }
    if (!semesterId) return;
    startCopyTransition(async () => {
      const result = await copySemesterStructure(copySourceId, semesterId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("คัดลอกโครงสร้างแล้ว");
      invalidateAll();
    });
  }
```

with:

```typescript
  function handleCopyStructure(includeStudents: boolean) {
    if (!copySourceId) {
      toast.error("กรุณาเลือกภาคเรียนต้นทาง");
      return;
    }
    if (!semesterId) return;
    if (includeStudents && !window.confirm("คัดลอกโครงสร้างพร้อมลงทะเบียนนักเรียนที่กำลังเรียนเข้าห้องเดิม?")) {
      return;
    }
    startCopyTransition(async () => {
      const result = await copySemesterStructure(copySourceId, semesterId, includeStudents);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        includeStudents
          ? `คัดลอกพร้อมนักเรียน ${result.enrolledCount} คน`
          : "คัดลอกโครงสร้างแล้ว",
      );
      invalidateAll();
    });
  }
```

- [ ] **Step 2: Update the hint text**

Replace (line ~280):

```tsx
                ภาค {semesterNumber} ยังไม่มีชั้นเรียน — คัดลอกโครงสร้างจากภาคอื่น (ไม่รวมนักเรียน)
```

with:

```tsx
                ภาค {semesterNumber} ยังไม่มีชั้นเรียน — คัดลอกโครงสร้างจากภาคอื่น
```

- [ ] **Step 3: Replace the single button with two buttons**

Replace the existing single `<Button>` block (currently lines ~298-307):

```tsx
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={copyPending || !copySourceId}
                onClick={handleCopyStructure}
              >
                <Copy className="mr-1 h-4 w-4" />
                {copyPending ? "กำลังคัดลอก..." : "คัดลอกโครงสร้าง"}
              </Button>
```

with:

```tsx
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={copyPending || !copySourceId}
                onClick={() => handleCopyStructure(false)}
              >
                <Copy className="mr-1 h-4 w-4" />
                {copyPending ? "กำลังคัดลอก..." : "คัดลอกแต่โครงสร้าง"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={copyPending || !copySourceId}
                onClick={() => handleCopyStructure(true)}
              >
                <Copy className="mr-1 h-4 w-4" />
                {copyPending ? "กำลังคัดลอก..." : "คัดลอกพร้อมนักเรียน"}
              </Button>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: PASS — `result.enrolledCount` is available because `copySemesterStructure` now returns `CopyStructureResult` (the `ok: true` branch carries `enrolledCount`).

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/registration/registration-panel.tsx
git commit -m "feat(registration): two copy options — structure only vs with students"
```

---

### Task 4: Manual verification

**Files:** none (manual check against a running dev server with seeded data).

- [ ] **Step 1: Start the app and a target semester that is empty**

Run: `npm run dev`
Open `/registration`, pick an academic year + a semester that has **no** classrooms but whose sibling semester **has** classrooms with enrolled students.

- [ ] **Step 2: Verify "คัดลอกแต่โครงสร้าง"**

Choose the source semester, click **คัดลอกแต่โครงสร้าง**.
Expected: toast "คัดลอกโครงสร้างแล้ว"; grades + classrooms appear; every room shows **0 คน**.

- [ ] **Step 3: Reset and verify "คัดลอกพร้อมนักเรียน"**

Empty the target semester again (delete its grades), reload, choose the source, click **คัดลอกพร้อมนักเรียน**, confirm the dialog.
Expected: toast "คัดลอกพร้อมนักเรียน N คน"; each target room shows the same enrolled roster as the matching source room; students with non-`enrolled` status in the source are **not** present.

- [ ] **Step 4: Verify guard still holds**

With the target semester now populated, the copy panel should no longer appear (it only renders when `grades.length === 0`). Confirmed: no duplicate-copy path.
