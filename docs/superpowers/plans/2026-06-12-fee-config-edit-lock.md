# Fee Config Edit Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock editing of fee items and per-grade fee rates once an invoice that uses them has been issued, while still allowing `is_active` toggling and row reordering.

**Architecture:** Two pure eligibility helpers (unit-tested) decide what is locked. Client react-query functions fetch the locked sets and feed them as props into `FeeItemsSection` / `FeeRatesMatrix`, which disable the relevant inputs. The two server actions (`updateFeeItem`, `upsertFeeRates`) re-check the lock server-side so the client cannot bypass it.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase JS, TanStack Query, Vitest, Tailwind, shadcn-style UI.

**Spec:** `docs/superpowers/specs/2026-06-12-fee-config-edit-lock-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/finance/fee-item-edit-eligibility.ts` (+ `.test.ts`) | Pure: did a locked fee-item field change? |
| `src/lib/finance/fee-rate-edit-eligibility.ts` (+ `.test.ts`) | Pure: split rate entries into allowed/locked by grade |
| `src/lib/queries/fee-rates.ts` | Client queries: invoiced fee-item ids, invoiced grade ids |
| `src/lib/data/invoices.ts` | Server helper: `listInvoicedGradeLevelIds` |
| `src/lib/actions/fee-items.ts` | Enforce lock in `updateFeeItem` |
| `src/lib/actions/fee-rates.ts` | Enforce lock in `upsertFeeRates` (+ `invoiceTypeId` param) |
| `src/components/finance/invoice-type-fee-dialog.tsx` | Fetch lock sets, pass as props |
| `src/components/finance/fee-items-section.tsx` | `lockedItemIds` prop + disabled inputs / badge |
| `src/components/finance/fee-rates-matrix.tsx` | `lockedGradeIds` + `invoiceTypeId` props + disabled rows |

---

## Task 1: Pure helper — fee item locked fields

**Files:**
- Create: `src/lib/finance/fee-item-edit-eligibility.ts`
- Test: `src/lib/finance/fee-item-edit-eligibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/finance/fee-item-edit-eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { feeItemLockedFieldsChanged } from "@/lib/finance/fee-item-edit-eligibility";

const base = {
  name: "ค่าเทอม",
  description: "เทอมต้น" as string | null,
  isTuition: true,
  hasReimbursableVariant: false,
};

describe("feeItemLockedFieldsChanged", () => {
  it("returns false when nothing changed", () => {
    expect(feeItemLockedFieldsChanged(base, { ...base })).toBe(false);
  });

  it("returns true when name changes", () => {
    expect(feeItemLockedFieldsChanged(base, { ...base, name: "ค่าเทอมใหม่" })).toBe(true);
  });

  it("returns true when isTuition changes", () => {
    expect(feeItemLockedFieldsChanged(base, { ...base, isTuition: false })).toBe(true);
  });

  it("returns true when hasReimbursableVariant changes", () => {
    expect(
      feeItemLockedFieldsChanged(base, { ...base, hasReimbursableVariant: true }),
    ).toBe(true);
  });

  it("returns true when description changes", () => {
    expect(feeItemLockedFieldsChanged(base, { ...base, description: "เทอมปลาย" })).toBe(true);
  });

  it("treats null and empty-string description as equal", () => {
    expect(
      feeItemLockedFieldsChanged(
        { ...base, description: null },
        { ...base, description: "" },
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fee-item-edit-eligibility`
Expected: FAIL — cannot resolve `@/lib/finance/fee-item-edit-eligibility`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/finance/fee-item-edit-eligibility.ts`:

```ts
export type FeeItemLockableFields = {
  name: string;
  description: string | null;
  isTuition: boolean;
  hasReimbursableVariant: boolean;
};

/**
 * True when any field that is frozen after invoicing differs between the
 * current row and the proposed update. `is_active` is intentionally excluded —
 * it stays editable because it only affects future invoice generation.
 */
export function feeItemLockedFieldsChanged(
  current: FeeItemLockableFields,
  next: FeeItemLockableFields,
): boolean {
  return (
    current.name !== next.name ||
    (current.description ?? "") !== (next.description ?? "") ||
    current.isTuition !== next.isTuition ||
    current.hasReimbursableVariant !== next.hasReimbursableVariant
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fee-item-edit-eligibility`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/fee-item-edit-eligibility.ts src/lib/finance/fee-item-edit-eligibility.test.ts
git commit -m "feat(finance): add fee-item edit-lock eligibility helper"
```

---

## Task 2: Pure helper — partition rate entries by lock

**Files:**
- Create: `src/lib/finance/fee-rate-edit-eligibility.ts`
- Test: `src/lib/finance/fee-rate-edit-eligibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/finance/fee-rate-edit-eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { partitionRateEntriesByLock } from "@/lib/finance/fee-rate-edit-eligibility";

const e = (gradeLevelId: string, feeItemId: string) => ({ gradeLevelId, feeItemId });

describe("partitionRateEntriesByLock", () => {
  it("returns all as allowed when no locked grades", () => {
    const entries = [e("g1", "i1"), e("g2", "i1")];
    const { allowed, locked } = partitionRateEntriesByLock(entries, new Set());
    expect(allowed).toHaveLength(2);
    expect(locked).toHaveLength(0);
  });

  it("moves locked-grade entries to locked", () => {
    const entries = [e("g1", "i1"), e("g2", "i1")];
    const { allowed, locked } = partitionRateEntriesByLock(entries, new Set(["g1"]));
    expect(allowed).toEqual([e("g2", "i1")]);
    expect(locked).toEqual([e("g1", "i1")]);
  });

  it("returns all as locked when every grade is locked", () => {
    const entries = [e("g1", "i1"), e("g2", "i2")];
    const { allowed, locked } = partitionRateEntriesByLock(
      entries,
      new Set(["g1", "g2"]),
    );
    expect(allowed).toHaveLength(0);
    expect(locked).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fee-rate-edit-eligibility`
Expected: FAIL — cannot resolve `@/lib/finance/fee-rate-edit-eligibility`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/finance/fee-rate-edit-eligibility.ts`:

```ts
/**
 * Split rate upsert entries into those whose grade is unlocked (`allowed`) and
 * those whose grade already has an issued invoice and is therefore frozen
 * (`locked`). Generic over the entry shape; only `gradeLevelId` is required.
 */
export function partitionRateEntriesByLock<T extends { gradeLevelId: string }>(
  entries: T[],
  lockedGradeIds: Set<string>,
): { allowed: T[]; locked: T[] } {
  const allowed: T[] = [];
  const locked: T[] = [];
  for (const entry of entries) {
    if (lockedGradeIds.has(entry.gradeLevelId)) locked.push(entry);
    else allowed.push(entry);
  }
  return { allowed, locked };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fee-rate-edit-eligibility`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/fee-rate-edit-eligibility.ts src/lib/finance/fee-rate-edit-eligibility.test.ts
git commit -m "feat(finance): add fee-rate edit-lock partition helper"
```

---

## Task 3: Client queries for locked sets

**Files:**
- Modify: `src/lib/queries/fee-rates.ts` (append two functions)

These run with the browser Supabase client (same as the existing functions in this file). They have no unit tests (they hit Supabase); they are verified manually in Task 8/9.

- [ ] **Step 1: Add `fetchInvoicedFeeItemIds`**

Append to `src/lib/queries/fee-rates.ts`:

```ts
/** fee_item ids of this invoice type that already appear on an issued invoice. */
export async function fetchInvoicedFeeItemIds(invoiceTypeId: string): Promise<string[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("invoice_lines")
    .select("fee_item_id, fee_items!inner(invoice_type_id)")
    .eq("fee_items.invoice_type_id", invoiceTypeId);

  if (error || !data) return [];

  type Row = { fee_item_id: string };
  return [...new Set((data as unknown as Row[]).map((row) => row.fee_item_id))];
}
```

- [ ] **Step 2: Add `fetchInvoicedGradeIds`**

Append to `src/lib/queries/fee-rates.ts`:

```ts
/** grade_level ids that have an issued invoice of this type in this semester. */
export async function fetchInvoicedGradeIds(
  semesterId: string,
  invoiceTypeId: string,
): Promise<string[]> {
  const supabase = createClient();

  const { data: invoices } = await supabase
    .from("student_invoices")
    .select("student_id")
    .eq("semester_id", semesterId)
    .eq("invoice_type_id", invoiceTypeId);

  const studentIds = [...new Set((invoices ?? []).map((r) => r.student_id))];
  if (studentIds.length === 0) return [];

  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_id, classrooms!inner(grade_level_id)")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled")
    .in("student_id", studentIds);

  type Row = { student_id: string; classrooms: { grade_level_id: string } };
  return [
    ...new Set(
      ((enrollments ?? []) as unknown as Row[]).map((r) => r.classrooms.grade_level_id),
    ),
  ];
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/fee-rates.ts
git commit -m "feat(finance): add client queries for invoiced fee items and grades"
```

---

## Task 4: Server helper — invoiced grade ids

**Files:**
- Modify: `src/lib/data/invoices.ts` (append one function)

- [ ] **Step 1: Add `listInvoicedGradeLevelIds`**

Append to `src/lib/data/invoices.ts` (before the trailing `function round2`):

```ts
/** grade_level ids with an issued invoice of this type in this semester (server). */
export async function listInvoicedGradeLevelIds(
  semesterId: string,
  invoiceTypeId: string,
): Promise<Set<string>> {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("student_invoices")
    .select("student_id")
    .eq("semester_id", semesterId)
    .eq("invoice_type_id", invoiceTypeId);

  const studentIds = [...new Set((invoices ?? []).map((r) => r.student_id))];
  if (studentIds.length === 0) return new Set();

  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_id, classrooms!inner(grade_level_id)")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled")
    .in("student_id", studentIds);

  type Row = { student_id: string; classrooms: { grade_level_id: string } };
  return new Set(
    ((enrollments ?? []) as unknown as Row[]).map((r) => r.classrooms.grade_level_id),
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/invoices.ts
git commit -m "feat(finance): add server helper for invoiced grade levels"
```

---

## Task 5: Enforce lock in `updateFeeItem`

**Files:**
- Modify: `src/lib/actions/fee-items.ts` (the `updateFeeItem` function and imports)

- [ ] **Step 1: Add the import**

At the top of `src/lib/actions/fee-items.ts`, below the existing
`import { feeItemDeleteBlockedReason } ...` line, add:

```ts
import { feeItemLockedFieldsChanged } from "@/lib/finance/fee-item-edit-eligibility";
```

- [ ] **Step 2: Replace the body of `updateFeeItem`**

Replace the current `updateFeeItem` implementation (from `const supabase = await createClient();` through the final `return { ok: true };`) with:

```ts
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("fee_items")
    .select("name, description, is_tuition, has_reimbursable_variant")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { ok: false, error: "ไม่พบรายการค่าใช้จ่าย" };

  const nextDescription = input.description?.trim() || null;

  const { count } = await supabase
    .from("invoice_lines")
    .select("id", { count: "exact", head: true })
    .eq("fee_item_id", id);

  const referenced = (count ?? 0) > 0;
  if (
    referenced &&
    feeItemLockedFieldsChanged(
      {
        name: current.name,
        description: current.description,
        isTuition: current.is_tuition,
        hasReimbursableVariant: current.has_reimbursable_variant,
      },
      {
        name,
        description: nextDescription,
        isTuition: input.isTuition,
        hasReimbursableVariant: input.hasReimbursableVariant,
      },
    )
  ) {
    return {
      ok: false,
      error: "ออกใบแจ้งชำระแล้ว ไม่สามารถแก้ไขรายการนี้ได้ (แก้ได้เฉพาะสถานะใช้งาน)",
    };
  }

  const { error } = await supabase
    .from("fee_items")
    .update({
      name,
      description: nextDescription,
      is_tuition: input.isTuition,
      is_active: input.isActive,
      has_reimbursable_variant: input.hasReimbursableVariant,
    })
    .eq("id", id);

  if (error) return { ok: false, error: "ไม่สามารถบันทึกรายการค่าใช้จ่ายได้" };

  revalidateFeePaths();
  return { ok: true };
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/fee-items.ts
git commit -m "feat(finance): block locked fee-item field edits server-side"
```

---

## Task 6: Enforce lock in `upsertFeeRates`

**Files:**
- Modify: `src/lib/actions/fee-rates.ts` (signature, imports, body)

- [ ] **Step 1: Add imports**

Below the existing `import { getSemesterById } ...` line in `src/lib/actions/fee-rates.ts`, add:

```ts
import { listInvoicedGradeLevelIds } from "@/lib/data/invoices";
import { partitionRateEntriesByLock } from "@/lib/finance/fee-rate-edit-eligibility";
```

- [ ] **Step 2: Add `invoiceTypeId` parameter and lock check**

Change the signature:

```ts
export async function upsertFeeRates(
  semesterId: string,
  invoiceTypeId: string,
  entries: FeeRateUpsertEntry[],
): Promise<ActionState> {
```

Then, immediately after the `if (!semester) return ...` line, insert:

```ts
  const lockedGradeIds = await listInvoicedGradeLevelIds(semesterId, invoiceTypeId);
  const { locked } = partitionRateEntriesByLock(entries, lockedGradeIds);
  if (locked.length > 0) {
    return {
      ok: false,
      error: "ออกใบแจ้งชำระแล้ว ไม่สามารถแก้อัตราของชั้นที่ออกบิลแล้วได้",
    };
  }
```

- [ ] **Step 3: Type-check (expected to fail at the caller)**

Run: `npx tsc --noEmit`
Expected: ONE error in `src/components/finance/fee-rates-matrix.tsx` — `upsertFeeRates` now needs 3 args. That caller is fixed in Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/fee-rates.ts
git commit -m "feat(finance): block locked grade fee-rate edits server-side"
```

---

## Task 7: Fetch lock sets in the dialog and pass props

**Files:**
- Modify: `src/components/finance/invoice-type-fee-dialog.tsx`

- [ ] **Step 1: Extend the import from queries**

Change the existing import line:

```ts
import { fetchFeeItems, fetchFeeRateMatrix } from "@/lib/queries/fee-rates";
```

to:

```ts
import {
  fetchFeeItems,
  fetchFeeRateMatrix,
  fetchInvoicedFeeItemIds,
  fetchInvoicedGradeIds,
} from "@/lib/queries/fee-rates";
```

- [ ] **Step 2: Add the two lock queries**

After the existing `matrix` `useQuery` block (the one with `queryKey: ["fee-rate-matrix", ...]`), add:

```ts
  const { data: invoicedItemIds = [] } = useQuery({
    queryKey: ["invoiced-fee-items", invoiceTypeId],
    queryFn: () => fetchInvoicedFeeItemIds(invoiceTypeId!),
    enabled: open && Boolean(invoiceTypeId),
  });

  const { data: invoicedGradeIds = [] } = useQuery({
    queryKey: ["invoiced-grades", ctx?.semesterId, invoiceTypeId],
    queryFn: () => fetchInvoicedGradeIds(ctx!.semesterId, invoiceTypeId!),
    enabled: open && Boolean(ctx?.semesterId) && Boolean(invoiceTypeId),
  });

  const lockedItemIds = useMemo(() => new Set(invoicedItemIds), [invoicedItemIds]);
  const lockedGradeIds = useMemo(() => new Set(invoicedGradeIds), [invoicedGradeIds]);
```

- [ ] **Step 3: Import `useMemo`**

Change the React import at the top:

```ts
import { useQuery } from "@tanstack/react-query";
```

stays, and add a new line directly under it:

```ts
import { useMemo } from "react";
```

- [ ] **Step 4: Pass the props to the children**

Replace the render block:

```tsx
              <FeeItemsSection items={feeItems} invoiceTypeId={invoiceTypeId} />
              <FeeRatesMatrix semesterId={ctx.semesterId} matrix={matrix} />
```

with:

```tsx
              <FeeItemsSection
                items={feeItems}
                invoiceTypeId={invoiceTypeId}
                lockedItemIds={lockedItemIds}
              />
              <FeeRatesMatrix
                semesterId={ctx.semesterId}
                invoiceTypeId={invoiceTypeId}
                matrix={matrix}
                lockedGradeIds={lockedGradeIds}
              />
```

- [ ] **Step 5: Type-check (expected to fail in the child components)**

Run: `npx tsc --noEmit`
Expected: errors that `FeeItemsSection` / `FeeRatesMatrix` do not yet accept the new props — fixed in Tasks 8 and 9.

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/invoice-type-fee-dialog.tsx
git commit -m "feat(finance): fetch invoiced lock sets in fee config dialog"
```

---

## Task 8: Lock UI in `FeeItemsSection`

**Files:**
- Modify: `src/components/finance/fee-items-section.tsx`

- [ ] **Step 1: Add the `lockedItemIds` prop and a `Lock` icon import**

Change the icon import:

```ts
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
```

to:

```ts
import { GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";
```

Change the props type:

```ts
type FeeItemsSectionProps = {
  items: FeeItemRow[];
  invoiceTypeId: string;
  lockedItemIds: Set<string>;
};

export function FeeItemsSection({ items, invoiceTypeId, lockedItemIds }: FeeItemsSectionProps) {
```

- [ ] **Step 2: Derive whether the item being edited is locked**

Directly after the `const allSelected = ...` / `const someSelected = ...` lines (just before `return (`), add:

```ts
  const editLocked = editTarget ? lockedItemIds.has(editTarget.id) : false;
```

- [ ] **Step 3: Show a lock badge on locked rows**

In the status `<TableCell>` that renders the active/inactive badge, replace:

```tsx
                            <TableCell>
                              {item.isActive ? (
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                  ใช้งาน
                                </Badge>
                              ) : (
                                <Badge variant="outline">ปิดใช้งาน</Badge>
                              )}
                            </TableCell>
```

with:

```tsx
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {item.isActive ? (
                                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                    ใช้งาน
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">ปิดใช้งาน</Badge>
                                )}
                                {lockedItemIds.has(item.id) ? (
                                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                                    <Lock className="h-3 w-3" />
                                    ออกบิลแล้ว
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
```

- [ ] **Step 4: Disable locked fields in the edit dialog**

In the edit/create `<Dialog>`, replace the name input, description input, and the "มีราคาเบิกได้แยก" label block with versions that respect `editLocked`. Replace:

```tsx
              <div className="grid gap-2">
                <Label htmlFor="fee-item-name">ชื่อรายการ</Label>
                <Input
                  id="fee-item-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ค่าเทอม"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fee-item-desc">คำอธิบาย (ไม่บังคับ)</Label>
                <Input
                  id="fee-item-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Label className="flex w-fit cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={hasReimbursableVariant}
                  onChange={(e) => setHasReimbursableVariant(e.target.checked)}
                />
                มีราคาเบิกได้แยก
              </Label>
```

with:

```tsx
              {editLocked ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  ออกใบแจ้งชำระแล้ว — แก้ไขได้เฉพาะสถานะใช้งาน
                </p>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="fee-item-name">ชื่อรายการ</Label>
                <Input
                  id="fee-item-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ค่าเทอม"
                  disabled={editLocked}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fee-item-desc">คำอธิบาย (ไม่บังคับ)</Label>
                <Input
                  id="fee-item-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={editLocked}
                />
              </div>
              <Label className="flex w-fit items-center gap-3 has-[:disabled]:cursor-not-allowed has-[:enabled]:cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={hasReimbursableVariant}
                  onChange={(e) => setHasReimbursableVariant(e.target.checked)}
                  disabled={editLocked}
                />
                มีราคาเบิกได้แยก
              </Label>
```

> The "ใช้งานอยู่" checkbox below stays untouched — it must remain editable.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors for `fee-items-section.tsx` (matrix may still error until Task 9).

- [ ] **Step 6: Manual verification (preview)**

Start the dev server (`preview_start`), open ประเภทใบแจ้ง → ตั้งค่าค่าธรรมเนียม for a type whose item has an issued invoice. Confirm:
- locked item row shows the "ออกบิลแล้ว" badge
- its Edit dialog disables name/description/มีราคาเบิกได้แยก, shows the note, leaves "ใช้งานอยู่" toggleable and saving the toggle works (`บันทึกรายการแล้ว`)
- an un-invoiced item still edits fully

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/fee-items-section.tsx
git commit -m "feat(finance): lock invoiced fee-item fields in edit UI"
```

---

## Task 9: Lock UI in `FeeRatesMatrix`

**Files:**
- Modify: `src/components/finance/fee-rates-matrix.tsx`

- [ ] **Step 1: Add props**

Change the props type and destructure:

```ts
type FeeRatesMatrixProps = {
  semesterId: string;
  invoiceTypeId: string;
  matrix: FeeRateMatrix;
  lockedGradeIds: Set<string>;
};

export function FeeRatesMatrix({
  semesterId,
  invoiceTypeId,
  matrix,
  lockedGradeIds,
}: FeeRatesMatrixProps) {
```

- [ ] **Step 2: Skip locked grades when building `changedEntries`**

Inside the `changedEntries` useMemo, at the very top of the outer `for (const grade of matrix.grades)` loop body, add a guard:

```ts
    for (const grade of matrix.grades) {
      if (lockedGradeIds.has(grade.id)) continue;
      for (const item of matrix.items) {
```

(Leave the rest of the loop unchanged.) Also add `lockedGradeIds` to the dependency array of this useMemo: change `}, [draft, matrix]);` (the one for `changedEntries`) to `}, [draft, matrix, lockedGradeIds]);`.

- [ ] **Step 3: Pass `invoiceTypeId` to the action**

In `handleSave`, change:

```ts
    const result = await upsertFeeRates(semesterId, changedEntries);
```

to:

```ts
    const result = await upsertFeeRates(semesterId, invoiceTypeId, changedEntries);
```

- [ ] **Step 4: Mark locked grade rows and disable their inputs**

Inside `matrix.grades.map((grade) => (...))`, replace the grade-name cell:

```tsx
                    <TableCell className="sticky left-0 bg-card font-medium">{grade.name}</TableCell>
```

with a version that adds a lock badge, and capture a per-row `rowLocked`. Change the row opening from:

```tsx
                {matrix.grades.map((grade) => (
                  <TableRow key={grade.id}>
                    <TableCell className="sticky left-0 bg-card font-medium">{grade.name}</TableCell>
```

to:

```tsx
                {matrix.grades.map((grade) => {
                  const rowLocked = lockedGradeIds.has(grade.id);
                  return (
                  <TableRow key={grade.id}>
                    <TableCell className="sticky left-0 bg-card font-medium">
                      <div className="flex items-center gap-2">
                        <span>{grade.name}</span>
                        {rowLocked ? (
                          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                            ออกบิลแล้ว
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
```

Then add `disabled={rowLocked}` to all three `<Input>` elements inside this row (the two in the `hasReimbursableVariant` branch — `amount` and `amountReimbursable` — and the single one in the `else` branch).

Finally, close the new block: change the row's closing from:

```tsx
                  </TableRow>
                ))}
```

to:

```tsx
                  </TableRow>
                  );
                })}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the Task 6 caller error is now resolved).

- [ ] **Step 6: Lint + full test run**

Run: `npm run lint`
Expected: no new errors.
Run: `npm test`
Expected: all tests pass (including Tasks 1–2).

- [ ] **Step 7: Manual verification (preview)**

In the same dialog, for a type+semester where a grade has been invoiced:
- that grade row shows "ออกบิลแล้ว" and all its amount inputs are disabled
- other grade rows remain editable and save normally (`บันทึกอัตราค่าธรรมเนียมแล้ว`)

- [ ] **Step 8: Commit**

```bash
git add src/components/finance/fee-rates-matrix.tsx
git commit -m "feat(finance): lock invoiced grade rows in fee-rate matrix"
```

---

## Final verification

- [ ] **Run the whole suite + build**

Run: `npm test` → all pass
Run: `npm run lint` → clean
Run: `npx tsc --noEmit` → clean
Run: `npm run build` → succeeds

- [ ] **End-to-end manual pass (preview)**

1. Un-invoiced type: fee items fully editable, all grade rows editable.
2. Issue an invoice for one grade with one fee item.
3. Re-open ตั้งค่าค่าธรรมเนียม: that fee item is field-locked (toggle still works); that grade's rate row is read-only; everything else still editable.
4. Confirm server enforcement: editing is correctly rejected even if inputs are forced enabled (optional — via devtools).
```
