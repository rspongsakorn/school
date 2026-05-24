# Academic Year & Students Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build admin pages for academic year/semester setup (wizard + edit) and student master CRUD with search, filter, and pagination.

**Architecture:** Server Components load data via `lib/data/*`; client islands (Dialog, Sheet, table toolbar) call Server Actions in `lib/actions/*` that enforce admin role and call `revalidatePath`. Pure validation/date helpers are unit-tested with Vitest.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase SSR, shadcn/ui, Vitest

**Spec:** [2026-05-24-academic-students-admin-design.md](../specs/2026-05-24-academic-students-admin-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/academic-year/validation.ts` | Date-range validation, semester-outside-year warning |
| `src/lib/academic-year/semester-dates.ts` | Default semester date split from year range |
| `src/lib/students/constants.ts` | Status labels + filter options |
| `src/lib/auth/require-admin.ts` | Server-side admin guard |
| `src/lib/data/academic-years.ts` | Read years + nested semesters |
| `src/lib/data/students.ts` | Paginated student list |
| `src/lib/actions/academic-years.ts` | create/update year + semesters |
| `src/lib/actions/students.ts` | create/update/delete student |
| `src/components/academic-year/*` | Table, wizard, edit dialog |
| `src/components/students/*` | Table toolbar, sheet |
| `src/app/(dashboard)/academic-year/page.tsx` | Admin-only year page |
| `src/app/(dashboard)/students/page.tsx` | Student list page |

---

### Task 1: Vitest + pure helpers (TDD foundation)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/academic-year/validation.ts`
- Create: `src/lib/academic-year/semester-dates.ts`
- Create: `src/lib/academic-year/validation.test.ts`
- Create: `src/lib/academic-year/semester-dates.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Write failing tests for validation**

Create `src/lib/academic-year/validation.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isValidDateRange, isSemesterOutsideYear } from "./validation";

describe("isValidDateRange", () => {
  it("returns true when end >= start", () => {
    expect(isValidDateRange("2025-05-01", "2026-04-30")).toBe(true);
  });

  it("returns false when end < start", () => {
    expect(isValidDateRange("2026-04-30", "2025-05-01")).toBe(false);
  });
});

describe("isSemesterOutsideYear", () => {
  it("returns true when semester starts before year", () => {
    expect(
      isSemesterOutsideYear(
        { start: "2025-05-01", end: "2026-04-30" },
        { start: "2025-04-01", end: "2025-10-31" },
      ),
    ).toBe(true);
  });

  it("returns false when semester is inside year", () => {
    expect(
      isSemesterOutsideYear(
        { start: "2025-05-01", end: "2026-04-30" },
        { start: "2025-05-16", end: "2025-10-31" },
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests — expect FAIL**

```bash
npm test
```

Expected: FAIL — module `./validation` not found

- [ ] **Step 5: Implement `src/lib/academic-year/validation.ts`**

```typescript
type DateRange = { start: string; end: string };

export function isValidDateRange(start: string, end: string): boolean {
  return end >= start;
}

export function isSemesterOutsideYear(year: DateRange, semester: DateRange): boolean {
  return semester.start < year.start || semester.end > year.end;
}
```

- [ ] **Step 6: Write failing tests for semester date defaults**

Create `src/lib/academic-year/semester-dates.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { defaultSemesterDates } from "./semester-dates";

describe("defaultSemesterDates", () => {
  it("splits year into two contiguous halves", () => {
    const result = defaultSemesterDates("2025-05-01", "2026-04-30");
    expect(result.semester1.start).toBe("2025-05-01");
    expect(result.semester1.end).toBe("2025-11-16");
    expect(result.semester2.start).toBe("2025-11-17");
    expect(result.semester2.end).toBe("2026-04-30");
  });
});
```

- [ ] **Step 7: Run tests — semester-dates FAIL**

```bash
npm test
```

Expected: validation tests PASS, semester-dates FAIL

- [ ] **Step 8: Implement `src/lib/academic-year/semester-dates.ts`**

```typescript
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  return Math.round((e - s) / 86_400_000);
}

export function defaultSemesterDates(yearStart: string, yearEnd: string) {
  const totalDays = daysBetween(yearStart, yearEnd);
  const half = Math.floor(totalDays / 2);
  const sem1End = addDays(yearStart, half);
  const sem2Start = addDays(sem1End, 1);

  return {
    semester1: { start: yearStart, end: sem1End },
    semester2: { start: sem2Start, end: yearEnd },
  };
}
```

- [ ] **Step 9: Run all tests — expect PASS**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/academic-year/
git commit -m "test: add vitest and academic year date helpers"
```

---

### Task 2: shadcn UI primitives + types + toast

**Files:**
- Modify: `src/lib/supabase/types.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/components/ui/dialog.tsx` (via shadcn CLI)
- Create: `src/components/ui/sheet.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/alert-dialog.tsx`
- Create: `src/components/ui/sonner.tsx`
- Create: `src/lib/students/constants.ts`

- [ ] **Step 1: Add shadcn components**

```bash
npx shadcn@latest add dialog sheet input label alert-dialog sonner --yes
```

- [ ] **Step 2: Mount Toaster in root layout**

Modify `src/app/layout.tsx` — add import and component inside `<body>`:

```tsx
import { Toaster } from "@/components/ui/sonner";

// inside body, after {children}:
<Toaster richColors position="top-center" />
```

- [ ] **Step 3: Update Supabase types**

Replace `src/lib/supabase/types.ts` semester and student rows:

```typescript
semesters: TableDef<{
  id: string;
  academic_year_id: string;
  number: number;
  name: string | null;
  start_date: string;
  end_date: string;
}>;
students: TableDef<{
  id: string;
  student_code: string;
  first_name: string;
  last_name: string;
  id_card: string | null;
  status: "active" | "graduated" | "transferred" | "withdrawn";
}>;
```

- [ ] **Step 4: Create student status constants**

Create `src/lib/students/constants.ts`:

```typescript
export type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn";

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: "กำลังศึกษา",
  graduated: "จบการศึกษา",
  transferred: "ย้ายออก",
  withdrawn: "ลาออก",
};

export const STUDENT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "active", label: "กำลังศึกษา" },
  { value: "graduated", label: "จบการศึกษา" },
  { value: "transferred", label: "ย้ายออก" },
  { value: "withdrawn", label: "ลาออก" },
] as const;

export const STUDENTS_PAGE_SIZE = 50;
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/types.ts src/app/layout.tsx src/lib/students/constants.ts src/components/ui/
git commit -m "chore: add shadcn form primitives and update Supabase types"
```

---

### Task 3: Admin auth guard

**Files:**
- Create: `src/lib/auth/require-admin.ts`

- [ ] **Step 1: Implement require-admin**

Create `src/lib/auth/require-admin.ts`:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentProfileRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) return null;
  return profile;
}

export async function requireAdminPage() {
  const profile = await getCurrentProfileRole();
  if (profile?.role !== "admin") {
    redirect("/");
  }
  return profile;
}

export async function requireAdminAction(): Promise<
  { ok: true; profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfileRole>>> } | { ok: false; error: string }
> {
  const profile = await getCurrentProfileRole();
  if (!profile) {
    return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
  }
  if (profile.role !== "admin") {
    return { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };
  }
  return { ok: true, profile };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth/require-admin.ts
git commit -m "feat: add admin auth guard helpers"
```

---

### Task 4: Academic years data layer

**Files:**
- Create: `src/lib/data/academic-years.ts`

- [ ] **Step 1: Implement data accessors**

Create `src/lib/data/academic-years.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";

export type SemesterRow = {
  id: string;
  number: number;
  name: string | null;
  start_date: string;
  end_date: string;
};

export type AcademicYearRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  semesters: SemesterRow[];
};

export async function listAcademicYears(): Promise<AcademicYearRow[]> {
  const supabase = await createClient();

  const { data: years, error } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_active")
    .order("start_date", { ascending: false });

  if (error || !years) return [];

  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name, start_date, end_date")
    .in(
      "academic_year_id",
      years.map((y) => y.id),
    )
    .order("number", { ascending: true });

  const semestersByYear = new Map<string, SemesterRow[]>();
  for (const sem of semesters ?? []) {
    const list = semestersByYear.get(sem.academic_year_id) ?? [];
    list.push({
      id: sem.id,
      number: sem.number,
      name: sem.name,
      start_date: sem.start_date,
      end_date: sem.end_date,
    });
    semestersByYear.set(sem.academic_year_id, list);
  }

  return years.map((y) => ({
    ...y,
    semesters: semestersByYear.get(y.id) ?? [],
  }));
}

export async function getAcademicYearById(id: string): Promise<AcademicYearRow | null> {
  const years = await listAcademicYears();
  return years.find((y) => y.id === id) ?? null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/academic-years.ts
git commit -m "feat: add academic years data accessors"
```

---

### Task 5: Academic years Server Actions

**Files:**
- Create: `src/lib/actions/academic-years.ts`

- [ ] **Step 1: Implement actions**

Create `src/lib/actions/academic-years.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { isValidDateRange } from "@/lib/academic-year/validation";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok: true } | { ok: false; error: string };

type YearInput = {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type SemesterInput = {
  number: 1 | 2;
  name: string;
  startDate: string;
  endDate: string;
};

function validateYear(input: YearInput): string | null {
  if (!input.name.trim()) return "กรุณากรอกชื่อปีการศึกษา";
  if (!input.startDate || !input.endDate) return "กรุณากรอกวันที่เริ่มและสิ้นสุด";
  if (!isValidDateRange(input.startDate, input.endDate)) {
    return "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม";
  }
  return null;
}

function validateSemesters(semesters: SemesterInput[]): string | null {
  for (const sem of semesters) {
    if (!sem.startDate || !sem.endDate) return `กรุณากรอกวันที่ภาคเรียนที่ ${sem.number}`;
    if (!isValidDateRange(sem.startDate, sem.endDate)) {
      return `วันที่ภาคเรียนที่ ${sem.number} ไม่ถูกต้อง`;
    }
  }
  return null;
}

async function unsetOtherActiveYears(supabase: Awaited<ReturnType<typeof createClient>>, exceptId?: string) {
  let query = supabase.from("academic_years").update({ is_active: false }).eq("is_active", true);
  if (exceptId) {
    query = query.neq("id", exceptId);
  }
  await query;
}

export async function createYearWithSemesters(
  year: YearInput,
  semesters: SemesterInput[],
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const yearError = validateYear(year);
  if (yearError) return { ok: false, error: yearError };

  const semError = validateSemesters(semesters);
  if (semError) return { ok: false, error: semError };

  const supabase = await createClient();

  if (year.isActive) {
    await unsetOtherActiveYears(supabase);
  }

  const { data: createdYear, error: yearInsertError } = await supabase
    .from("academic_years")
    .insert({
      name: year.name.trim(),
      start_date: year.startDate,
      end_date: year.endDate,
      is_active: year.isActive,
    })
    .select("id")
    .single();

  if (yearInsertError || !createdYear) {
    return { ok: false, error: "ไม่สามารถสร้างปีการศึกษาได้" };
  }

  const semesterRows = semesters.map((s) => ({
    academic_year_id: createdYear.id,
    number: s.number,
    name: s.name.trim() || null,
    start_date: s.startDate,
    end_date: s.endDate,
  }));

  const { error: semInsertError } = await supabase.from("semesters").insert(semesterRows);

  if (semInsertError) {
    await supabase.from("academic_years").delete().eq("id", createdYear.id);
    return { ok: false, error: "ไม่สามารถสร้างภาคเรียนได้" };
  }

  revalidatePath("/academic-year");
  return { ok: true };
}

export async function updateYearWithSemesters(
  yearId: string,
  year: YearInput,
  semesters: SemesterInput[],
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const yearError = validateYear(year);
  if (yearError) return { ok: false, error: yearError };

  const semError = validateSemesters(semesters);
  if (semError) return { ok: false, error: semError };

  const supabase = await createClient();

  if (year.isActive) {
    await unsetOtherActiveYears(supabase, yearId);
  }

  const { error: yearUpdateError } = await supabase
    .from("academic_years")
    .update({
      name: year.name.trim(),
      start_date: year.startDate,
      end_date: year.endDate,
      is_active: year.isActive,
    })
    .eq("id", yearId);

  if (yearUpdateError) {
    return { ok: false, error: "ไม่สามารถแก้ไขปีการศึกษาได้" };
  }

  for (const sem of semesters) {
    const { error } = await supabase
      .from("semesters")
      .update({
        name: sem.name.trim() || null,
        start_date: sem.startDate,
        end_date: sem.endDate,
      })
      .eq("academic_year_id", yearId)
      .eq("number", sem.number);

    if (error) {
      return { ok: false, error: `ไม่สามารถแก้ไขภาคเรียนที่ ${sem.number} ได้` };
    }
  }

  revalidatePath("/academic-year");
  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/academic-years.ts
git commit -m "feat: add academic year server actions"
```

---

### Task 6: Academic year UI + page

**Files:**
- Create: `src/components/academic-year/year-table.tsx`
- Create: `src/components/academic-year/year-wizard-dialog.tsx`
- Create: `src/components/academic-year/year-edit-dialog.tsx`
- Create: `src/components/academic-year/academic-year-panel.tsx`
- Modify: `src/app/(dashboard)/academic-year/page.tsx`

- [ ] **Step 1: Create `year-table.tsx` (server-friendly presentational)**

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatThaiDate } from "@/lib/format";
import type { AcademicYearRow } from "@/lib/data/academic-years";

type YearTableProps = {
  years: AcademicYearRow[];
  onEdit: (year: AcademicYearRow) => void;
};

export function YearTable({ years, onEdit }: YearTableProps) {
  if (years.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        ยังไม่มีปีการศึกษา — กด &quot;สร้างปีการศึกษาใหม่&quot; เพื่อเริ่มต้น
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ชื่อปี</TableHead>
          <TableHead>วันที่</TableHead>
          <TableHead>สถานะ</TableHead>
          <TableHead className="w-[100px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {years.map((year) => (
          <TableRow key={year.id}>
            <TableCell className="font-medium">{year.name}</TableCell>
            <TableCell>
              {formatThaiDate(year.start_date)} – {formatThaiDate(year.end_date)}
            </TableCell>
            <TableCell>
              {year.is_active ? <Badge>ใช้งาน</Badge> : null}
            </TableCell>
            <TableCell>
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(year)}>
                แก้ไข
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create `year-wizard-dialog.tsx` (client, 3 steps)**

Implement client component with:
- `"use client"`
- Local state: `step` (1|2|3), year fields, semester1/2 fields
- On step 1 "ถัดไป": call `defaultSemesterDates(start, end)` to prefill semesters
- Show amber warning via `isSemesterOutsideYear` (non-blocking)
- On submit: `createYearWithSemesters(...)` → toast success/error → `onOpenChange(false)` + router.refresh()

Key props:

```tsx
type YearWizardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
```

Use `<Dialog>`, `<Input type="date">`, checkbox for isActive, buttons ย้อนกลับ/ถัดไป/ยืนยันสร้าง.

- [ ] **Step 3: Create `year-edit-dialog.tsx` (client)**

Single dialog editing year + both semesters. Props:

```tsx
type YearEditDialogProps = {
  year: AcademicYearRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
```

Calls `updateYearWithSemesters` on save.

- [ ] **Step 4: Create `academic-year-panel.tsx` (client wrapper)**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AcademicYearRow } from "@/lib/data/academic-years";
import { YearTable } from "./year-table";
import { YearWizardDialog } from "./year-wizard-dialog";
import { YearEditDialog } from "./year-edit-dialog";

export function AcademicYearPanel({ years }: { years: AcademicYearRow[] }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editYear, setEditYear] = useState<AcademicYearRow | null>(null);

  return (
  <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setWizardOpen(true)}>+ สร้างปีการศึกษาใหม่</Button>
      </div>
    <YearTable years={years} onEdit={setEditYear} />
    <YearWizardDialog open={wizardOpen} onOpenChange={setWizardOpen} />
    <YearEditDialog year={editYear} open={!!editYear} onOpenChange={(o) => !o && setEditYear(null)} />
  </>
  );
}
```


- [ ] **Step 5: Wire page**

Replace `src/app/(dashboard)/academic-year/page.tsx`:

```tsx
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcademicYearPanel } from "@/components/academic-year/academic-year-panel";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listAcademicYears } from "@/lib/data/academic-years";

export default async function AcademicYearPage() {
  const profile = await requireAdminPage();
  const years = await listAcademicYears();

  return (
    <>
      <AppHeader title="ปีการศึกษา" displayName={profile.display_name} />
      <main className="p-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>ปีการศึกษาและภาคเรียน</CardTitle>
            <CardDescription>ตั้งค่าปีการศึกษาและภาคเรียนที่ 1 / 2</CardDescription>
          </CardHeader>
          <CardContent>
            <AcademicYearPanel years={years} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
```

Note: `AppHeader` without yearName/semesterNumber — master page per spec.

- [ ] **Step 6: Build verify**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/academic-year/ src/app/(dashboard)/academic-year/page.tsx
git commit -m "feat: add academic year admin page with wizard and edit"
```

---

### Task 7: Students data layer (paginated)

**Files:**
- Modify: `src/lib/data/students.ts`

- [ ] **Step 1: Add paginated list function**

Add to `src/lib/data/students.ts` (keep existing `listStudents` or replace usage):

```typescript
import { STUDENT_STATUS_LABELS, STUDENTS_PAGE_SIZE, type StudentStatus } from "@/lib/students/constants";

export type StudentListParams = {
  q?: string;
  status?: StudentStatus | "all";
  page?: number;
  academicYearId?: string | null;
};

export type PaginatedStudents = {
  rows: StudentListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listStudentsPaginated(params: StudentListParams): Promise<PaginatedStudents> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = STUDENTS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select("id, student_code, first_name, last_name, id_card, status", { count: "exact" })
    .order("student_code", { ascending: true });

  const q = params.q?.trim();
  if (q) {
    query = query.or(
      `student_code.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`,
    );
  }

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  const { data: students, count, error } = await query.range(from, to);

  if (error || !students) {
    return { rows: [], total: 0, page, pageSize, totalPages: 0 };
  }

  const gradeByStudent = params.academicYearId
    ? await getStudentGradeMap(params.academicYearId)
    : new Map<string, string>();

  const rows = students.map((s) => ({
    id: s.id,
    studentCode: s.student_code,
    name: formatStudentName(s.first_name, s.last_name),
    idCard: s.id_card,
    grade: gradeByStudent.get(s.id) ?? "—",
    status: STUDENT_STATUS_LABELS[s.status as StudentStatus] ?? s.status,
    statusRaw: s.status as StudentStatus,
    firstName: s.first_name,
    lastName: s.last_name,
  }));

  const total = count ?? 0;
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
```

Update `StudentListRow` type to include `idCard`, `statusRaw`, `firstName`, `lastName`.

Remove duplicate `statusLabels` — use `STUDENT_STATUS_LABELS` from constants.

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/students.ts
git commit -m "feat: add paginated student list query"
```

---

### Task 8: Students Server Actions

**Files:**
- Create: `src/lib/actions/students.ts`

- [ ] **Step 1: Implement CRUD actions**

Create `src/lib/actions/students.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/lib/auth/require-admin";
import type { StudentStatus } from "@/lib/students/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/actions/academic-years";

type StudentFormInput = {
  studentCode: string;
  firstName: string;
  lastName: string;
  idCard: string;
  status: StudentStatus;
};

function validateStudent(input: StudentFormInput): string | null {
  if (!input.studentCode.trim()) return "กรุณากรอกรหัสนักเรียน";
  if (!input.firstName.trim()) return "กรุณากรอกชื่อ";
  if (!input.lastName.trim()) return "กรุณากรอกนามสกุล";
  return null;
}

export async function createStudent(input: StudentFormInput): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const validationError = validateStudent(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase.from("students").insert({
    student_code: input.studentCode.trim(),
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    id_card: input.idCard.trim() || null,
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

  const validationError = validateStudent(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({
      student_code: input.studentCode.trim(),
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      id_card: input.idCard.trim() || null,
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

export async function deleteStudent(id: string): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const [enrollments, invoices, payments] = await Promise.all([
    supabase.from("student_enrollments").select("id", { count: "exact", head: true }).eq("student_id", id),
    supabase.from("student_invoices").select("id", { count: "exact", head: true }).eq("student_id", id),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("student_id", id),
  ]);

  const refCount =
    (enrollments.count ?? 0) + (invoices.count ?? 0) + (payments.count ?? 0);

  if (refCount > 0) {
    return {
      ok: false,
      error: "ไม่สามารถลบได้ — มีประวัติการลงทะเบียนหรือใบแจ้งชำระ กรุณาเปลี่ยนสถานะแทน",
    };
  }

  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };

  revalidatePath("/students");
  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/students.ts
git commit -m "feat: add student CRUD server actions"
```

---

### Task 9: Students UI + page

**Files:**
- Create: `src/components/students/student-sheet.tsx`
- Create: `src/components/students/students-panel.tsx`
- Modify: `src/app/(dashboard)/students/page.tsx`

- [ ] **Step 1: Create `student-sheet.tsx` (client)**

Sheet with form fields, save button, delete button (edit mode + admin only).

Props:

```tsx
type StudentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  readOnly?: boolean;
  initial?: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
    idCard: string | null;
    status: StudentStatus;
  };
};
```

On save: call `createStudent` or `updateStudent`, toast result, close + refresh on success.

Delete: open `AlertDialog`, call `deleteStudent`.

- [ ] **Step 2: Create `students-panel.tsx` (client)**

Toolbar:
- `<Input>` search with 300ms debounce → `router.push(?q=&status=&page=1)` preserving params
- `<Select>` status filter
- Add button (admin only)

Table: map rows, click row opens sheet.

Pagination: Prev/Next buttons updating `?page=`.

Props from server page:

```tsx
type StudentsPanelProps = {
  data: PaginatedStudents;
  params: { q: string; status: string; page: number };
  isAdmin: boolean;
};
```

- [ ] **Step 3: Update students page**

```tsx
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentsPanel } from "@/components/students/students-panel";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";
import { getYearSemesterContext } from "@/lib/data/context";
import { listStudentsPaginated } from "@/lib/data/students";
import type { StudentStatus } from "@/lib/students/constants";

type SearchParams = Promise<{ q?: string; status?: string; page?: string }>;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const [profile, context] = await Promise.all([
    getCurrentProfileRole(),
    getYearSemesterContext(),
  ]);

  const q = sp.q ?? "";
  const status = (sp.status ?? "all") as StudentStatus | "all";
  const page = Number(sp.page ?? "1") || 1;

  const data = await listStudentsPaginated({
    q,
    status,
    page,
    academicYearId: context?.academicYearId ?? null,
  });

  const isAdmin = profile?.role === "admin";

  return (
    <>
      <AppHeader
        title="นักเรียน"
        displayName={profile?.display_name ?? "ผู้ใช้"}
        yearName={context?.academicYearName}
        semesterNumber={context?.semesterNumber}
      />
      <main className="p-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>รายชื่อนักเรียน</CardTitle>
            <CardDescription>
              {data.total > 0 ? `${data.total} คน` : "ยังไม่มีนักเรียนในระบบ"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StudentsPanel
              data={data}
              params={{ q, status, page }}
              isAdmin={isAdmin}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Build verify**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/ src/app/(dashboard)/students/page.tsx
git commit -m "feat: add student admin page with sheet CRUD and pagination"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: PASS

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors (fix any reported)

- [ ] **Step 3: Manual smoke test (admin user required)**

Follow checklist in spec §9:
- Create academic year via wizard → verify 2 semesters in Supabase
- Set is_active → other years unset
- Edit semester dates
- Add/edit/search/filter/paginate students
- Delete student without FK refs
- Attempt delete student with enrollment → Thai error toast
- Login as finance → no mutate buttons on `/students`
- Login as non-admin → `/academic-year` redirects to `/`

- [ ] **Step 4: Update spec status**

In `docs/superpowers/specs/2026-05-24-academic-students-admin-design.md` line 4:

```markdown
**Status:** Approved
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-24-academic-students-admin-design.md
git commit -m "docs: mark academic students admin spec as approved"
```

---

## Self-review notes

| Spec requirement | Task |
|------------------|------|
| Wizard 3 steps | Task 6 |
| is_active single year | Task 5 actions |
| Edit year + semesters | Task 6 |
| Student Sheet CRUD | Task 9 |
| Conditional delete | Task 8 |
| Search + filter + pagination | Tasks 7, 9 |
| Admin-only academic-year | Tasks 3, 6 |
| Finance/teacher read-only | Task 9 `isAdmin` prop |
| Toast UX | Tasks 2, 6, 9 |
| Types update | Task 2 |

No TBD placeholders. Vitest covers pure helpers; integration verified manually (no Playwright in project yet).
