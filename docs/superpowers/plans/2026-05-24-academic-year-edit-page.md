# Academic Year Full-Page Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace academic year create/edit dialogs with full pages at `/academic-year/new` and `/academic-year/[id]`, using a two-column layout and a semester dialog for add/edit.

**Architecture:** Server pages load year data via `getAcademicYearById`; client `AcademicYearFormPage` handles layout, year save on the left, semester summary list on the right, and `SemesterDialog` for semester mutations. List page navigates via row click and Link.

**Tech Stack:** Next.js 16 App Router, Server Actions, shadcn/ui, sonner, existing semester actions

**Spec:** [2026-05-24-academic-year-edit-page-design.md](../specs/2026-05-24-academic-year-edit-page-design.md)

**React best practices (required before coding):** Read `vendor/react-best-practices/SKILL.md` per `.cursor/skills/react-best-practices/SKILL.md`.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/actions/academic-years.ts` | Return `yearId` from create for redirect |
| `src/app/(dashboard)/academic-year/new/page.tsx` | Create page shell |
| `src/app/(dashboard)/academic-year/[id]/page.tsx` | Edit page shell + notFound |
| `src/components/academic-year/academic-year-form-page.tsx` | Two-column layout, year form, delete year |
| `src/components/academic-year/semester-dialog.tsx` | Add/edit semester modal |
| `src/components/academic-year/semester-summary-list.tsx` | Read-only rows + actions |
| `src/components/academic-year/academic-year-panel.tsx` | Link to `/new`, remove dialogs |
| `src/components/academic-year/year-table.tsx` | Row click + edit link navigate |

**Delete:** `year-edit-dialog.tsx`, `year-wizard-dialog.tsx`, `semester-list-editor.tsx`

---

### Task 1: Return year ID from create action

**Files:**
- Modify: `src/lib/actions/academic-years.ts`

- [ ] **Step 1: Extend ActionState for create success**

```typescript
export type CreateYearResult =
  | { ok: true; yearId: string }
  | { ok: false; error: string };

export async function createYearWithSemesters(
  year: YearInput,
  semesters: SemesterInput[],
): Promise<CreateYearResult> {
  // ... existing validation ...
  const { data, error } = await supabase.rpc("create_academic_year_with_semesters", { ... });

  if (error) return { ok: false, error: mapAcademicYearMutationError(error) };
  if (!data) return { ok: false, error: "ไม่สามารถสร้างปีการศึกษาได้" };

  revalidatePath("/academic-year");
  return { ok: true, yearId: data as string };
}
```

RPC returns `uuid` per migration — use returned `data` as `yearId`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/academic-years.ts
git commit -m "feat: return year id from create academic year action"
```

---

### Task 2: SemesterDialog component

**Files:**
- Create: `src/components/academic-year/semester-dialog.tsx`

- [ ] **Step 1: Implement dialog**

```typescript
"use client";

// Props: open, onOpenChange, mode, academicYearId, yearDates { start, end }, semesters (for default dates), initial?

// On open create: compute defaults via nextSemesterDefaultDates(yearDates, semesters mapped to start/end)
// Submit create -> addSemester(academicYearId, { name, startDate, endDate })
// Submit edit -> updateSemester(initial.id, ...)
// validateSemesterForm + FieldError + toast + router.refresh()
```

Dialog title: `เพิ่มภาคเรียน` / `แก้ไขภาคเรียนที่ {number}`

- [ ] **Step 2: Commit**

```bash
git add src/components/academic-year/semester-dialog.tsx
git commit -m "feat: add semester dialog for academic year pages"
```

---

### Task 3: SemesterSummaryList component

**Files:**
- Create: `src/components/academic-year/semester-summary-list.tsx`

- [ ] **Step 1: Implement list**

```typescript
type SemesterSummaryListProps = {
  academicYearId: string;
  yearStartDate: string;
  yearEndDate: string;
  semesters: SemesterRow[];
};

// Each row: Badge ภาค N, name + formatThaiDate range, แก้ไข -> setDialogState edit, ลบ -> AlertDialog -> deleteSemester
// Parent passes dialog state OR list owns SemesterDialog state internally
// Empty: "ยังไม่มีภาคเรียน — กดเพิ่มภาคเรียน"
```

- [ ] **Step 2: Commit**

```bash
git add src/components/academic-year/semester-summary-list.tsx
git commit -m "feat: add semester summary list for academic year page"
```

---

### Task 4: AcademicYearFormPage (two-column layout)

**Files:**
- Create: `src/components/academic-year/academic-year-form-page.tsx`

- [ ] **Step 1: Page chrome**

```tsx
<Link href="/academic-year">← กลับรายการปีการศึกษา</Link>
<div className="flex items-center justify-between">
  <h1>{mode === "create" ? "เพิ่มปีการศึกษา" : `แก้ไขปีการศึกษา ${year.name}`}</h1>
  {mode === "edit" && !year.is_active && (
    <Button variant="outline" className="text-destructive" onClick={...}>ลบปี</Button>
  )}
</div>
```

Delete year: `deleteAcademicYear` → toast → `router.push("/academic-year")`

- [ ] **Step 2: Two-column grid**

```tsx
<div className="grid gap-6 lg:grid-cols-[320px_1fr]">
  <Card className="lg:sticky lg:top-20 lg:self-start h-fit">
    {/* year fields + บันทึกข้อมูลปี */}
  </Card>
  <Card>
    {/* semester header + add button + SemesterSummaryList or disabled hint */}
  </Card>
</div>
```

**Mode create:**
- `yearState` local defaults empty dates
- Save: `defaultSemesterDates` for sem1 → `createYearWithSemesters` → `router.push(/academic-year/${result.yearId})`
- Right column: disabled until save (spec) — on create page only show left column message on right

**Mode edit:**
- Props `year: AcademicYearRow`
- Save: `updateYearMetadata(year.id, ...)`
- Right: `SemesterSummaryList` + add opens `SemesterDialog` create

- [ ] **Step 3: Wire SemesterDialog at page level**

State: `semesterDialog: null | { mode: "create" } | { mode: "edit"; initial: ... }`

- [ ] **Step 4: Commit**

```bash
git add src/components/academic-year/academic-year-form-page.tsx
git commit -m "feat: add two-column academic year form page"
```

---

### Task 5: App routes

**Files:**
- Create: `src/app/(dashboard)/academic-year/new/page.tsx`
- Create: `src/app/(dashboard)/academic-year/[id]/page.tsx`

- [ ] **Step 1: new/page.tsx**

```typescript
import { AppHeader } from "@/components/app-header";
import { AcademicYearFormPage } from "@/components/academic-year/academic-year-form-page";
import { requireAdminPage } from "@/lib/auth/require-admin";

export default async function NewAcademicYearPage() {
  const profile = await requireAdminPage();
  return (
    <>
      <AppHeader title="เพิ่มปีการศึกษา" displayName={profile.display_name ?? "ผู้ใช้"} showContextSelectors={false} />
      <main className="p-6">
        <AcademicYearFormPage mode="create" />
      </main>
    </>
  );
}
```

- [ ] **Step 2: [id]/page.tsx**

```typescript
import { notFound } from "next/navigation";
import { getAcademicYearById } from "@/lib/data/academic-years";

export default async function EditAcademicYearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAdminPage();
  const year = await getAcademicYearById(id);
  if (!year) notFound();

  return (
    <>
      <AppHeader title="แก้ไขปีการศึกษา" ... />
      <main className="p-6">
        <AcademicYearFormPage mode="edit" year={year} />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/academic-year/new/page.tsx src/app/(dashboard)/academic-year/[id]/page.tsx
git commit -m "feat: add academic year new and edit routes"
```

---

### Task 6: Update list page navigation

**Files:**
- Modify: `src/components/academic-year/academic-year-panel.tsx`
- Modify: `src/components/academic-year/year-table.tsx`

- [ ] **Step 1: academic-year-panel.tsx**

```typescript
import Link from "next/link";
// Remove YearEditDialog, YearWizardDialog imports and usage
<Button asChild>
  <Link href="/academic-year/new">เพิ่มปีการศึกษา</Link>
</Button>
<YearTable years={years} />
// Remove editingYear state
```

- [ ] **Step 2: year-table.tsx**

```typescript
import { useRouter } from "next/navigation";

// TableRow: className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/academic-year/${year.id}`)}
// Edit button: <Button asChild onClick={(e) => e.stopPropagation()}><Link href={`/academic-year/${year.id}`}>แก้ไข</Link></Button>
// Delete button: e.stopPropagation() on click
```

- [ ] **Step 3: Delete old dialog files**

```bash
rm src/components/academic-year/year-edit-dialog.tsx
rm src/components/academic-year/year-wizard-dialog.tsx
rm src/components/academic-year/semester-list-editor.tsx
```

- [ ] **Step 4: Grep for removed imports — fix any**

```bash
rg "year-edit-dialog|year-wizard-dialog|semester-list-editor" src
```

- [ ] **Step 5: Commit**

```bash
git add src/components/academic-year/
git commit -m "feat: wire academic year list to full-page edit and remove dialogs"
```

---

### Task 7: Final verification

**Files:** none

- [ ] **Step 1: Run tests**

```bash
npm test
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

- [ ] **Step 3: Manual checklist (spec §10)**

- [ ] Row click and edit button open same page
- [ ] Delete on list does not navigate
- [ ] /new saves and redirects to /[id]
- [ ] Semester add/edit via dialog
- [ ] Delete year from edit page
- [ ] Mobile stacked layout

- [ ] **Step 4: Commit fixes if needed**

```bash
git commit -m "chore: academic year edit page verification fixes"
```

---

## Plan self-review

| Spec section | Task |
|--------------|------|
| §2 Routes | Task 5 |
| §3 List navigation | Task 6 |
| §4 Layout | Task 4 |
| §5 SemesterDialog | Task 2 |
| §6 /new flow + yearId | Task 1, 4 |
| §7 getAcademicYearById | Already exists — Task 5 only |
| §8 File map deletes | Task 6 |

No placeholders. `CreateYearResult` type named consistently in Task 1 and 4.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-academic-year-edit-page.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with executing-plans checkpoints

Which approach?
