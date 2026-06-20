# Student Promotion (Year Rollover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้แอดมินเลื่อนนักเรียนทั้งโรงเรียนจากภาคเรียนต้นทางไปลงทะเบียนในภาคเรียนปลายทาง (ปีใหม่) ในขั้นตอนเดียว พร้อมตั้งสถานะ "จบการศึกษา" ให้ชั้นสูงสุด

**Architecture:** Pure mapping logic (จับคู่ชั้นตามลำดับ + จับคู่ห้องตามชื่อ) ทดสอบด้วย unit test → data layer ประกอบ `PromotionPlan` → server actions (`getPromotionPreview`, `executePromotion`) → UI หน้าใหม่ `/registration/promote` ที่ให้แอดมินตรวจ/แก้ mapping แล้วยืนยัน

**Tech Stack:** Next.js (App Router, server actions), Supabase JS client, TanStack Query, Vitest, Tailwind/shadcn UI

อ้างอิง spec: `docs/superpowers/specs/2026-06-04-student-promotion-design.md`

---

## File Structure

- Create `src/lib/promotion/mapping.ts` — pure functions `mapGradesByOrder`, `mapClassroomsByName` + shared types
- Create `src/lib/promotion/mapping.test.ts` — unit tests
- Create `src/lib/data/promotion.ts` — `buildPromotionPlan` (server-side data assembly) + `PromotionPlan` types
- Create `src/lib/actions/promotion.ts` — `getPromotionPreview`, `executePromotion` server actions
- Create `src/lib/queries/promotion.ts` — client wrappers `fetchAllSemesters`
- Create `src/app/(dashboard)/registration/promote/page.tsx` — route
- Create `src/components/registration/promote-panel.tsx` — UI panel
- Modify `src/components/registration/registration-panel.tsx` — เพิ่มปุ่มลิงก์ไปหน้าเลื่อนชั้น (admin only)

---

## Task 1: Pure mapping logic

**Files:**
- Create: `src/lib/promotion/mapping.ts`
- Test: `src/lib/promotion/mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/promotion/mapping.test.ts
import { describe, expect, it } from "vitest";
import { mapClassroomsByName, mapGradesByOrder } from "./mapping";

const g = (id: string, name: string, sortOrder: number) => ({ id, name, sortOrder });
const c = (id: string, name: string) => ({ id, name });

describe("mapGradesByOrder", () => {
  it("maps each grade to the next one by sort order, last graduates", () => {
    const source = [g("s1", "ป.1", 1), g("s2", "ป.2", 2), g("s3", "ป.3", 3)];
    const target = [g("t1", "ป.1", 1), g("t2", "ป.2", 2), g("t3", "ป.3", 3)];
    expect(mapGradesByOrder(source, target)).toEqual([
      { sourceGradeId: "s1", targetGradeId: "t2" },
      { sourceGradeId: "s2", targetGradeId: "t3" },
      { sourceGradeId: "s3", targetGradeId: null },
    ]);
  });

  it("sorts inputs by sortOrder before mapping", () => {
    const source = [g("s2", "ป.2", 2), g("s1", "ป.1", 1)];
    const target = [g("t2", "ป.2", 2), g("t1", "ป.1", 1)];
    expect(mapGradesByOrder(source, target)).toEqual([
      { sourceGradeId: "s1", targetGradeId: "t2" },
      { sourceGradeId: "s2", targetGradeId: null },
    ]);
  });

  it("maps to null when target has fewer grades", () => {
    const source = [g("s1", "ป.1", 1), g("s2", "ป.2", 2)];
    const target = [g("t1", "ป.1", 1)];
    expect(mapGradesByOrder(source, target)).toEqual([
      { sourceGradeId: "s1", targetGradeId: null },
      { sourceGradeId: "s2", targetGradeId: null },
    ]);
  });

  it("returns empty for empty source", () => {
    expect(mapGradesByOrder([], [g("t1", "ป.1", 1)])).toEqual([]);
  });
});

describe("mapClassroomsByName", () => {
  it("matches classrooms by exact name", () => {
    const source = [c("s1", "1"), c("s2", "2")];
    const target = [c("t1", "1"), c("t2", "2")];
    expect(mapClassroomsByName(source, target)).toEqual([
      { sourceClassroomId: "s1", targetClassroomId: "t1" },
      { sourceClassroomId: "s2", targetClassroomId: "t2" },
    ]);
  });

  it("trims whitespace before comparing", () => {
    const source = [c("s1", " 1 ")];
    const target = [c("t1", "1")];
    expect(mapClassroomsByName(source, target)).toEqual([
      { sourceClassroomId: "s1", targetClassroomId: "t1" },
    ]);
  });

  it("returns null when no name matches", () => {
    const source = [c("s1", "1")];
    const target = [c("t1", "2")];
    expect(mapClassroomsByName(source, target)).toEqual([
      { sourceClassroomId: "s1", targetClassroomId: null },
    ]);
  });

  it("returns null target when target list is empty", () => {
    const source = [c("s1", "1")];
    expect(mapClassroomsByName(source, [])).toEqual([
      { sourceClassroomId: "s1", targetClassroomId: null },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/promotion/mapping.test.ts`
Expected: FAIL — cannot resolve `./mapping`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/promotion/mapping.ts
export type GradeRef = { id: string; name: string; sortOrder: number };
export type ClassroomRef = { id: string; name: string };

export type GradeMapping = { sourceGradeId: string; targetGradeId: string | null };
export type ClassroomMapping = {
  sourceClassroomId: string;
  targetClassroomId: string | null;
};

/** ชั้นต้นทางลำดับที่ i -> ชั้นปลายทางลำดับที่ i+1; ตัวสุดท้าย -> null (จบการศึกษา) */
export function mapGradesByOrder(source: GradeRef[], target: GradeRef[]): GradeMapping[] {
  const sortedSource = [...source].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedTarget = [...target].sort((a, b) => a.sortOrder - b.sortOrder);
  return sortedSource.map((grade, index) => ({
    sourceGradeId: grade.id,
    targetGradeId: sortedTarget[index + 1]?.id ?? null,
  }));
}

/** จับคู่ห้องต้นทาง -> ห้องปลายทางที่ชื่อ (trim) ตรงกัน; ไม่พบ -> null */
export function mapClassroomsByName(
  source: ClassroomRef[],
  target: ClassroomRef[],
): ClassroomMapping[] {
  const targetByName = new Map(target.map((room) => [room.name.trim(), room.id]));
  return source.map((room) => ({
    sourceClassroomId: room.id,
    targetClassroomId: targetByName.get(room.name.trim()) ?? null,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/promotion/mapping.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/promotion/mapping.ts src/lib/promotion/mapping.test.ts
git commit -m "feat: pure grade/classroom mapping for student promotion"
```

---

## Task 2: Data layer — buildPromotionPlan

**Files:**
- Create: `src/lib/data/promotion.ts`

อ่าน: `src/lib/data/grade-levels.ts`, `src/lib/data/classrooms.ts`, `src/lib/data/enrollments.ts` เป็นแบบอย่าง query (ใช้ `createClient` จาก `@/lib/supabase/server`)

- [ ] **Step 1: Write the data assembly module**

```ts
// src/lib/data/promotion.ts
import { formatStudentName } from "@/lib/format";
import {
  mapClassroomsByName,
  mapGradesByOrder,
  type GradeMapping,
} from "@/lib/promotion/mapping";
import { createClient } from "@/lib/supabase/server";

export type PromotionStudent = {
  studentId: string;
  studentCode: string;
  name: string;
  /** มี enrollment ในภาคปลายทางอยู่แล้ว -> จะถูกข้าม */
  alreadyInTarget: boolean;
};

export type PromotionClassroomPlan = {
  sourceClassroomId: string;
  sourceClassroomName: string;
  /** ห้องปลายทางที่จับคู่อัตโนมัติ (null = ต้องเลือกเอง) */
  defaultTargetClassroomId: string | null;
  students: PromotionStudent[];
};

export type PromotionTargetClassroom = {
  id: string;
  name: string;
};

export type PromotionGradePlan = {
  sourceGradeId: string;
  sourceGradeName: string;
  /** null = จบการศึกษา (ไม่มีชั้นถัดไป) */
  defaultTargetGradeId: string | null;
  classrooms: PromotionClassroomPlan[];
};

export type PromotionTargetGrade = {
  id: string;
  name: string;
  sortOrder: number;
  classrooms: PromotionTargetClassroom[];
};

export type PromotionPlan = {
  grades: PromotionGradePlan[];
  /** ชั้นปลายทางทั้งหมด (ให้ UI ใช้ทำ dropdown แก้ mapping) */
  targetGrades: PromotionTargetGrade[];
};

type GradeRow = { id: string; name: string; sort_order: number };
type ClassroomRow = { id: string; name: string; grade_level_id: string };
type EnrollmentRow = {
  classroom_id: string;
  students: {
    id: string;
    student_code: string;
    first_name: string;
    last_name: string;
  } | null;
};

export async function buildPromotionPlan(
  sourceSemesterId: string,
  targetSemesterId: string,
): Promise<PromotionPlan> {
  const supabase = await createClient();

  const [sourceGradesRes, targetGradesRes] = await Promise.all([
    supabase
      .from("grade_levels")
      .select("id, name, sort_order")
      .eq("semester_id", sourceSemesterId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("grade_levels")
      .select("id, name, sort_order")
      .eq("semester_id", targetSemesterId)
      .order("sort_order", { ascending: true }),
  ]);

  const sourceGrades = (sourceGradesRes.data ?? []) as GradeRow[];
  const targetGrades = (targetGradesRes.data ?? []) as GradeRow[];

  const [sourceClassroomsRes, targetClassroomsRes] = await Promise.all([
    supabase
      .from("classrooms")
      .select("id, name, grade_level_id")
      .eq("semester_id", sourceSemesterId)
      .order("name", { ascending: true }),
    supabase
      .from("classrooms")
      .select("id, name, grade_level_id")
      .eq("semester_id", targetSemesterId)
      .order("name", { ascending: true }),
  ]);

  const sourceClassrooms = (sourceClassroomsRes.data ?? []) as ClassroomRow[];
  const targetClassrooms = (targetClassroomsRes.data ?? []) as ClassroomRow[];

  // นักเรียนที่กำลังเรียนในภาคต้นทาง (ต่อห้อง)
  const { data: enrollmentData } = await supabase
    .from("student_enrollments")
    .select(
      `classroom_id, students ( id, student_code, first_name, last_name )`,
    )
    .eq("semester_id", sourceSemesterId)
    .eq("status", "enrolled");
  const enrollments = (enrollmentData ?? []) as unknown as EnrollmentRow[];

  // นักเรียนที่มี enrollment ในภาคปลายทางแล้ว
  const { data: targetEnrollData } = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("semester_id", targetSemesterId);
  const alreadyInTarget = new Set((targetEnrollData ?? []).map((row) => row.student_id));

  // group students by source classroom
  const studentsByClassroom = new Map<string, PromotionStudent[]>();
  for (const row of enrollments) {
    if (!row.students) continue;
    const list = studentsByClassroom.get(row.classroom_id) ?? [];
    list.push({
      studentId: row.students.id,
      studentCode: row.students.student_code,
      name: formatStudentName(row.students.first_name, row.students.last_name),
      alreadyInTarget: alreadyInTarget.has(row.students.id),
    });
    studentsByClassroom.set(row.classroom_id, list);
  }

  const gradeMap: GradeMapping[] = mapGradesByOrder(
    sourceGrades.map((x) => ({ id: x.id, name: x.name, sortOrder: x.sort_order })),
    targetGrades.map((x) => ({ id: x.id, name: x.name, sortOrder: x.sort_order })),
  );
  const targetGradeIdBySource = new Map(
    gradeMap.map((m) => [m.sourceGradeId, m.targetGradeId]),
  );

  const targetClassroomsByGrade = new Map<string, ClassroomRow[]>();
  for (const room of targetClassrooms) {
    const list = targetClassroomsByGrade.get(room.grade_level_id) ?? [];
    list.push(room);
    targetClassroomsByGrade.set(room.grade_level_id, list);
  }

  const grades: PromotionGradePlan[] = sourceGrades.map((grade) => {
    const targetGradeId = targetGradeIdBySource.get(grade.id) ?? null;
    const targetRooms = targetGradeId
      ? (targetClassroomsByGrade.get(targetGradeId) ?? [])
      : [];
    const sourceRooms = sourceClassrooms.filter((r) => r.grade_level_id === grade.id);
    const classroomMap = mapClassroomsByName(
      sourceRooms.map((r) => ({ id: r.id, name: r.name })),
      targetRooms.map((r) => ({ id: r.id, name: r.name })),
    );
    const targetBySource = new Map(
      classroomMap.map((m) => [m.sourceClassroomId, m.targetClassroomId]),
    );

    return {
      sourceGradeId: grade.id,
      sourceGradeName: grade.name,
      defaultTargetGradeId: targetGradeId,
      classrooms: sourceRooms.map((room) => ({
        sourceClassroomId: room.id,
        sourceClassroomName: room.name,
        defaultTargetClassroomId: targetBySource.get(room.id) ?? null,
        students: studentsByClassroom.get(room.id) ?? [],
      })),
    };
  });

  const targetGradesOut: PromotionTargetGrade[] = targetGrades.map((grade) => ({
    id: grade.id,
    name: grade.name,
    sortOrder: grade.sort_order,
    classrooms: (targetClassroomsByGrade.get(grade.id) ?? []).map((r) => ({
      id: r.id,
      name: r.name,
    })),
  }));

  return { grades, targetGrades: targetGradesOut };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/data/promotion.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/promotion.ts
git commit -m "feat: buildPromotionPlan data assembly for promotion preview"
```

---

## Task 3: Server actions

**Files:**
- Create: `src/lib/actions/promotion.ts`

อ่าน: `src/lib/actions/enrollments.ts` (รูปแบบ insert + จัดการ code 23505), `src/lib/auth/require-admin.ts`

- [ ] **Step 1: Write the actions module**

```ts
// src/lib/actions/promotion.ts
"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { buildPromotionPlan, type PromotionPlan } from "@/lib/data/promotion";
import { createClient } from "@/lib/supabase/server";

export type PromotionPreviewResult =
  | { ok: true; plan: PromotionPlan }
  | { ok: false; error: string };

export type ExecutePromotionInput = {
  targetSemesterId: string;
  enrollments: { studentId: string; targetClassroomId: string }[];
  graduateStudentIds: string[];
};

export type ExecutePromotionResult =
  | { ok: true; enrolled: number; skipped: number; graduated: number }
  | { ok: false; error: string };

export async function getPromotionPreview(
  sourceSemesterId: string,
  targetSemesterId: string,
): Promise<PromotionPreviewResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  if (!sourceSemesterId || !targetSemesterId) {
    return { ok: false, error: "กรุณาเลือกภาคเรียนต้นทางและปลายทาง" };
  }
  if (sourceSemesterId === targetSemesterId) {
    return { ok: false, error: "ภาคต้นทางและปลายทางต้องไม่ใช่ภาคเดียวกัน" };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("grade_levels")
    .select("id", { count: "exact", head: true })
    .eq("semester_id", targetSemesterId);

  if ((count ?? 0) === 0) {
    return { ok: false, error: "ภาคปลายทางยังไม่มีชั้นเรียน — กรุณาตั้งค่าโครงสร้างก่อน" };
  }

  const plan = await buildPromotionPlan(sourceSemesterId, targetSemesterId);
  return { ok: true, plan };
}

export async function executePromotion(
  input: ExecutePromotionInput,
): Promise<ExecutePromotionResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const { targetSemesterId, enrollments, graduateStudentIds } = input;
  if (!targetSemesterId) {
    return { ok: false, error: "ไม่พบภาคเรียนปลายทาง" };
  }

  const supabase = await createClient();

  // ดึง academic_year_id ของห้องปลายทางที่เกี่ยวข้อง
  const targetClassroomIds = [...new Set(enrollments.map((e) => e.targetClassroomId))];
  let enrolled = 0;
  let skipped = 0;

  if (targetClassroomIds.length > 0) {
    const { data: classrooms } = await supabase
      .from("classrooms")
      .select("id, academic_year_id, semester_id")
      .in("id", targetClassroomIds);

    const classroomMeta = new Map(
      (classrooms ?? []).map((c) => [c.id, c]),
    );

    // ข้ามนักเรียนที่มี enrollment ในภาคปลายทางแล้ว
    const studentIds = enrollments.map((e) => e.studentId);
    const { data: existing } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("semester_id", targetSemesterId)
      .in("student_id", studentIds);
    const existingSet = new Set((existing ?? []).map((r) => r.student_id));

    const rows = enrollments
      .filter((e) => {
        if (existingSet.has(e.studentId)) {
          skipped += 1;
          return false;
        }
        return classroomMeta.has(e.targetClassroomId);
      })
      .map((e) => {
        const meta = classroomMeta.get(e.targetClassroomId)!;
        return {
          student_id: e.studentId,
          classroom_id: e.targetClassroomId,
          academic_year_id: meta.academic_year_id,
          semester_id: meta.semester_id,
          status: "enrolled" as const,
        };
      });

    if (rows.length > 0) {
      const { error } = await supabase.from("student_enrollments").insert(rows);
      if (error && error.code !== "23505") {
        return { ok: false, error: "ไม่สามารถลงทะเบียนนักเรียนได้" };
      }
      enrolled = rows.length;
    }
  }

  let graduated = 0;
  if (graduateStudentIds.length > 0) {
    const { error } = await supabase
      .from("students")
      .update({ status: "graduated" })
      .in("id", graduateStudentIds);
    if (error) {
      return { ok: false, error: "ลงทะเบียนสำเร็จ แต่ตั้งสถานะจบการศึกษาไม่สำเร็จ" };
    }
    graduated = graduateStudentIds.length;
  }

  revalidatePath("/registration");
  revalidatePath("/students");
  return { ok: true, enrolled, skipped, graduated };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/promotion.ts
git commit -m "feat: getPromotionPreview and executePromotion server actions"
```

---

## Task 4: Client query helper + page route + UI panel

**Files:**
- Create: `src/lib/queries/promotion.ts`
- Create: `src/app/(dashboard)/registration/promote/page.tsx`
- Create: `src/components/registration/promote-panel.tsx`

อ่าน: `src/components/registration/registration-panel.tsx` (รูปแบบ Select, Card, Table, useTransition, toast, useRequireRole, AppHeader, AlertDialog), `src/lib/queries/registration.ts`

- [ ] **Step 1: Write client query helper**

```ts
// src/lib/queries/promotion.ts
import { createClient } from "@/lib/supabase/client";
import type { SemesterOption } from "@/lib/context/semester-params";

/** ภาคเรียนทั้งหมดในทุกปี (ไว้ทำ dropdown ต้นทาง/ปลายทาง) พร้อมชื่อปี */
export type SemesterChoice = SemesterOption & { academic_year_name: string };

export async function fetchAllSemesters(): Promise<SemesterChoice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name, academic_years ( name, start_date )")
    .order("start_date", { ascending: false, foreignTable: "academic_years" })
    .order("number", { ascending: true });

  if (error || !data) return [];

  type Row = {
    id: string;
    academic_year_id: string;
    number: number;
    name: string | null;
    academic_years: { name: string; start_date: string } | null;
  };

  return (data as unknown as Row[]).map((row) => ({
    id: row.id,
    academic_year_id: row.academic_year_id,
    number: row.number,
    name: row.name,
    academic_year_name: row.academic_years?.name ?? "—",
  }));
}
```

- [ ] **Step 2: Write the page route**

```tsx
// src/app/(dashboard)/registration/promote/page.tsx
import { PromotePanel } from "@/components/registration/promote-panel";

export default function PromotePage() {
  return <PromotePanel />;
}
```

- [ ] **Step 3: Write the UI panel**

```tsx
// src/components/registration/promote-panel.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRequireRole } from "@/components/providers/auth-provider";
import { fetchAllSemesters } from "@/lib/queries/promotion";
import {
  executePromotion,
  getPromotionPreview,
} from "@/lib/actions/promotion";
import type { PromotionPlan } from "@/lib/data/promotion";

const GRADUATE = "__graduate__";
const SKIP = "__skip__";

function semesterLabel(s: { academic_year_name: string; number: number; name: string | null }) {
  const sem = s.name ? `ภาค ${s.number} (${s.name})` : `ภาค ${s.number}`;
  return `${s.academic_year_name} — ${sem}`;
}

export function PromotePanel() {
  useRequireRole(["admin"]);

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [plan, setPlan] = useState<PromotionPlan | null>(null);
  // override mapping: sourceGradeId -> targetGradeId | GRADUATE
  const [gradeChoice, setGradeChoice] = useState<Record<string, string>>({});
  // override mapping: sourceClassroomId -> targetClassroomId | SKIP
  const [classroomChoice, setClassroomChoice] = useState<Record<string, string>>({});
  const [previewPending, startPreview] = useTransition();
  const [execPending, startExec] = useTransition();

  const { data: semesters = [] } = useQuery({
    queryKey: ["all-semesters"],
    queryFn: fetchAllSemesters,
  });

  function loadPreview() {
    if (!sourceId || !targetId) {
      toast.error("กรุณาเลือกภาคเรียนต้นทางและปลายทาง");
      return;
    }
    startPreview(async () => {
      const result = await getPromotionPreview(sourceId, targetId);
      if (!result.ok) {
        toast.error(result.error);
        setPlan(null);
        return;
      }
      setPlan(result.plan);
      // seed default choices
      const gc: Record<string, string> = {};
      const cc: Record<string, string> = {};
      for (const grade of result.plan.grades) {
        gc[grade.sourceGradeId] = grade.defaultTargetGradeId ?? GRADUATE;
        for (const room of grade.classrooms) {
          cc[room.sourceClassroomId] = room.defaultTargetClassroomId ?? SKIP;
        }
      }
      setGradeChoice(gc);
      setClassroomChoice(cc);
    });
  }

  // คำนวณผลลัพธ์จาก choices ปัจจุบัน
  const summary = useMemo(() => {
    if (!plan) return null;
    const enrollments: { studentId: string; targetClassroomId: string }[] = [];
    const graduateStudentIds: string[] = [];
    let needsClassroom = 0;
    let alreadyEnrolled = 0;

    for (const grade of plan.grades) {
      const target = gradeChoice[grade.sourceGradeId] ?? GRADUATE;
      for (const room of grade.classrooms) {
        for (const student of room.students) {
          if (student.alreadyInTarget) {
            alreadyEnrolled += 1;
            continue;
          }
          if (target === GRADUATE) {
            graduateStudentIds.push(student.studentId);
            continue;
          }
          const targetClassroomId = classroomChoice[room.sourceClassroomId];
          if (!targetClassroomId || targetClassroomId === SKIP) {
            needsClassroom += 1;
            continue;
          }
          enrollments.push({ studentId: student.studentId, targetClassroomId });
        }
      }
    }
    return { enrollments, graduateStudentIds, needsClassroom, alreadyEnrolled };
  }, [plan, gradeChoice, classroomChoice]);

  function runPromotion() {
    if (!plan || !summary) return;
    startExec(async () => {
      const result = await executePromotion({
        targetSemesterId: targetId,
        enrollments: summary.enrollments,
        graduateStudentIds: summary.graduateStudentIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `เลื่อนชั้นสำเร็จ — ลงทะเบียน ${result.enrolled} คน, จบการศึกษา ${result.graduated} คน, ข้าม ${result.skipped} คน`,
      );
      setPlan(null);
    });
  }

  return (
    <>
      <AppHeader title="เลื่อนชั้นขึ้นปีการศึกษา" basePath="/registration" />
      <main className="space-y-6 p-4 lg:p-6">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/registration">
            <ArrowLeft className="h-4 w-4" /> กลับหน้าลงทะเบียน
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>เลือกภาคเรียน</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ภาคต้นทาง</p>
              <Select value={sourceId || null} onValueChange={(v) => setSourceId(v ?? "")}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="เลือกภาคต้นทาง" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {semesterLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ภาคปลายทาง</p>
              <Select value={targetId || null} onValueChange={(v) => setTargetId(v ?? "")}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="เลือกภาคปลายทาง" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {semesterLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={loadPreview} disabled={previewPending}>
              {previewPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "สร้างแผนเลื่อนชั้น"}
            </Button>
          </CardContent>
        </Card>

        {plan && summary && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>จับคู่ชั้นเรียน</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชั้นต้นทาง</TableHead>
                      <TableHead>นักเรียน</TableHead>
                      <TableHead>ชั้นปลายทาง</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.grades.map((grade) => {
                      const count = grade.classrooms.reduce(
                        (sum, r) => sum + r.students.length,
                        0,
                      );
                      return (
                        <TableRow key={grade.sourceGradeId}>
                          <TableCell>{grade.sourceGradeName}</TableCell>
                          <TableCell>{count} คน</TableCell>
                          <TableCell>
                            <Select
                              value={gradeChoice[grade.sourceGradeId] ?? GRADUATE}
                              onValueChange={(v) =>
                                setGradeChoice((prev) => ({
                                  ...prev,
                                  [grade.sourceGradeId]: v ?? GRADUATE,
                                }))
                              }
                            >
                              <SelectTrigger className="w-56">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={GRADUATE}>จบการศึกษา</SelectItem>
                                {plan.targetGrades.map((tg) => (
                                  <SelectItem key={tg.id} value={tg.id}>
                                    {tg.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>จับคู่ห้องเรียน</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan.grades.map((grade) => {
                  const target = gradeChoice[grade.sourceGradeId] ?? GRADUATE;
                  if (target === GRADUATE) return null;
                  const targetGrade = plan.targetGrades.find((tg) => tg.id === target);
                  return (
                    <div key={grade.sourceGradeId} className="space-y-2">
                      <p className="text-sm font-medium">
                        {grade.sourceGradeName} → {targetGrade?.name ?? "—"}
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ห้องต้นทาง</TableHead>
                            <TableHead>นักเรียน</TableHead>
                            <TableHead>ห้องปลายทาง</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grade.classrooms.map((room) => (
                            <TableRow key={room.sourceClassroomId}>
                              <TableCell>{room.sourceClassroomName}</TableCell>
                              <TableCell>{room.students.length} คน</TableCell>
                              <TableCell>
                                <Select
                                  value={classroomChoice[room.sourceClassroomId] ?? SKIP}
                                  onValueChange={(v) =>
                                    setClassroomChoice((prev) => ({
                                      ...prev,
                                      [room.sourceClassroomId]: v ?? SKIP,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="w-48">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={SKIP}>ข้าม</SelectItem>
                                    {(targetGrade?.classrooms ?? []).map((tc) => (
                                      <SelectItem key={tc.id} value={tc.id}>
                                        {tc.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                <p className="text-sm text-muted-foreground">
                  ย้าย {summary.enrollments.length} คน · จบการศึกษา{" "}
                  {summary.graduateStudentIds.length} คน · ต้องเลือกห้อง{" "}
                  {summary.needsClassroom} คน · ลงทะเบียนแล้ว {summary.alreadyEnrolled} คน
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={execPending}>
                      {execPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ยืนยันเลื่อนชั้น"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>ยืนยันการเลื่อนชั้น</AlertDialogTitle>
                      <AlertDialogDescription>
                        จะลงทะเบียนนักเรียน {summary.enrollments.length} คน และตั้งสถานะจบการศึกษา{" "}
                        {summary.graduateStudentIds.length} คน ดำเนินการต่อหรือไม่?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                      <AlertDialogAction onClick={runPromotion}>ยืนยัน</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Verify type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/registration/promote-panel.tsx src/lib/queries/promotion.ts`
Expected: no errors. (`AlertDialogTrigger` ถูก export จาก `@/components/ui/alert-dialog` แล้ว — ตรวจสอบ; `Select` เป็น base-ui ดังนั้น `onValueChange` ให้ค่าเป็น `string | null` ต้อง coalesce เสมอ)

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/promotion.ts src/app/(dashboard)/registration/promote/page.tsx src/components/registration/promote-panel.tsx
git commit -m "feat: promotion UI page with grade/classroom mapping and confirm"
```

---

## Task 5: Entry button from registration page

**Files:**
- Modify: `src/components/registration/registration-panel.tsx`

- [ ] **Step 1: Add a link button (admin only) near the page actions**

ในส่วน render หลัง `<AppHeader title="ลงทะเบียน" ... />` (ในบล็อก `return (...)` หลัก ราว ๆ บรรทัด 261-266) เพิ่มปุ่มลิงก์ก่อนบล็อกคัดลอกโครงสร้าง:

```tsx
{isAdmin && (
  <div className="mb-4">
    <Button asChild variant="outline" size="sm" className="gap-2">
      <Link href="/registration/promote">
        <GraduationCap className="h-4 w-4" /> เลื่อนชั้นขึ้นปีการศึกษา
      </Link>
    </Button>
  </div>
)}
```

- [ ] **Step 2: Add the imports at the top of the file**

เพิ่ม `Link` และไอคอน:

```tsx
import Link from "next/link";
```

และเพิ่ม `GraduationCap` ใน import จาก `lucide-react` (บรรทัด 4) ให้เป็น:

```tsx
import { ArrowRightLeft, Copy, GraduationCap, Loader2, Pencil, Plus, Trash2, UserX } from "lucide-react";
```

- [ ] **Step 3: Verify type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/registration/registration-panel.tsx`
Expected: no errors

- [ ] **Step 4: Run full test + build sanity**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tests PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/registration/registration-panel.tsx
git commit -m "feat: add promotion entry button to registration page"
```

---

## Self-Review Notes

- **Spec coverage:** §3.1 enrolled-only (Task 2 query `.eq("status","enrolled")`); §3.2 grade mapping + editable (Task 1 + Task 4 grade Select); §3.3 classroom by name + manual pick (Task 1 + Task 4 classroom Select with SKIP); §3.4 graduate (Task 3 status update); §3.5 skip-existing (Task 2 `alreadyInTarget` + Task 3 existing check); §3.6 target-must-have-grades (Task 3 count guard); §3.7 admin-only (Task 3 `requireAdminAction`, Task 4 `useRequireRole`); §3.8 source≠target (Task 3 guard). All covered.
- **Types:** `PromotionPlan`, `PromotionGradePlan`, `PromotionClassroomPlan`, `PromotionTargetGrade`, `ExecutePromotionInput` ใช้ชื่อตรงกันทุก task.
- **No fee/invoice mutation** — ยืนยันว่า action แตะเฉพาะ `student_enrollments` และ `students.status`.
