# Dual-Pricing Fee Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มระบบราคา 2 ระดับ (เบิกได้ / เบิกไม่ได้) ต่อรายการค่าใช้จ่าย เจ้าหน้าที่เลือก variant ต่อรายนักเรียนตอนสร้างใบแจ้งชำระ แก้ได้ภายหลังถ้ายังไม่ชำระ

**Architecture:** ระดับ flag เป็น per-`fee_item` (ตั้งได้ทีละรายการ) + `amount_reimbursable` nullable ใน `fee_rates` (fallback ไป amount เดิม) + `is_reimbursable` boolean ที่ `student_invoices` + `variant` snapshot ใน `invoice_lines` Logic การเลือกราคารวมศูนย์ในฟังก์ชัน pure `pickFeeAmount` เพื่อ test ง่ายและใช้ซ้ำได้

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase (PostgreSQL) · React Query · Vitest · Tailwind

**Spec:** [docs/superpowers/specs/2026-05-28-dual-pricing-fee-items-design.md](../specs/2026-05-28-dual-pricing-fee-items-design.md)

---

## File Map

**Create:**
- `supabase/migrations/20260528000000_fee_items_reimbursable_variant.sql`
- `src/lib/finance/pick-fee-amount.ts`
- `src/lib/finance/pick-fee-amount.test.ts`
- `src/components/finance/invoice-reimbursable-dialog.tsx`

**Modify:**
- `src/lib/data/fee-items.ts` — เพิ่ม `hasReimbursableVariant` ใน `FeeItemRow`
- `src/lib/data/fee-rates.ts` — เพิ่ม `amount_reimbursable` ใน `FeeRateMatrix.rates`, expose `hasReimbursableVariant` ใน items
- `src/lib/data/invoices.ts` — เพิ่ม `isReimbursable` ใน `InvoiceListRow`
- `src/lib/queries/fee-rates.ts` — sync กับ data layer
- `src/lib/queries/invoices.ts` — sync `isReimbursable`
- `src/lib/actions/fee-items.ts` — รับ `hasReimbursableVariant` ใน create/update
- `src/lib/actions/fee-rates.ts` — รับ `amountReimbursable` ใน upsert
- `src/lib/actions/invoices.ts` — `generateInvoices` รับ `reimbursableStudentIds`; เพิ่ม `updateInvoiceReimbursable`
- `src/components/finance/fee-items-section.tsx` — checkbox ใน dialog, badge "2 ราคา"
- `src/components/finance/fee-rates-matrix.tsx` — dual input cell สำหรับ dual-pricing items
- `src/components/finance/invoice-generate-dialog.tsx` — ติ๊ก "เบิกได้" ต่อรายนักเรียน
- `src/components/finance/invoices-panel.tsx` — badge + filter + ปุ่ม "ราคาเบิกได้"
- `src/components/finance/outstanding-report-panel.tsx` — filter variant
- `src/components/finance/collections-report-panel.tsx` — filter variant
- `src/lib/queries/reports.ts` — รับ `variant` filter

---

## Phase 1: Database & Pure Helper

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260528000000_fee_items_reimbursable_variant.sql`

- [ ] **Step 1: Write the migration**

```sql
-- fee_items: per-item flag for dual pricing
ALTER TABLE public.fee_items
  ADD COLUMN has_reimbursable_variant boolean NOT NULL DEFAULT false;

-- fee_rates: optional reimbursable price (nullable, fallback to amount)
ALTER TABLE public.fee_rates
  ADD COLUMN amount_reimbursable numeric(10,2);

-- student_invoices: per-invoice variant flag
ALTER TABLE public.student_invoices
  ADD COLUMN is_reimbursable boolean NOT NULL DEFAULT false;

-- invoice_lines: snapshot of which variant was used
ALTER TABLE public.invoice_lines
  ADD COLUMN variant text NOT NULL DEFAULT 'standard'
    CHECK (variant IN ('standard', 'reimbursable'));
```

- [ ] **Step 2: Apply migration**

Run: `npm run db:push`
Expected: migration applies cleanly; existing rows get default values (no behavior change)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528000000_fee_items_reimbursable_variant.sql
git commit -m "feat(db): add dual-pricing columns for fee items and invoices"
```

---

### Task 2: `pickFeeAmount` pure helper

**Files:**
- Create: `src/lib/finance/pick-fee-amount.ts`
- Create: `src/lib/finance/pick-fee-amount.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/finance/pick-fee-amount.test.ts
import { describe, expect, it } from "vitest";
import { pickFeeAmount } from "./pick-fee-amount";

describe("pickFeeAmount", () => {
  it("returns standard amount when invoice is not reimbursable", () => {
    expect(
      pickFeeAmount({
        isReimbursable: false,
        hasReimbursableVariant: true,
        amount: 5000,
        amountReimbursable: 7000,
      }),
    ).toEqual({ amount: 5000, variant: "standard" });
  });

  it("returns reimbursable amount when invoice + item + price all set", () => {
    expect(
      pickFeeAmount({
        isReimbursable: true,
        hasReimbursableVariant: true,
        amount: 5000,
        amountReimbursable: 7000,
      }),
    ).toEqual({ amount: 7000, variant: "reimbursable" });
  });

  it("falls back to standard when amountReimbursable is null", () => {
    expect(
      pickFeeAmount({
        isReimbursable: true,
        hasReimbursableVariant: true,
        amount: 5000,
        amountReimbursable: null,
      }),
    ).toEqual({ amount: 5000, variant: "standard" });
  });

  it("returns standard when item does not have reimbursable variant", () => {
    expect(
      pickFeeAmount({
        isReimbursable: true,
        hasReimbursableVariant: false,
        amount: 5000,
        amountReimbursable: 7000,
      }),
    ).toEqual({ amount: 5000, variant: "standard" });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `npm test -- pick-fee-amount`
Expected: FAIL with "Cannot find module './pick-fee-amount'"

- [ ] **Step 3: Implement**

```ts
// src/lib/finance/pick-fee-amount.ts
export type FeeAmountVariant = "standard" | "reimbursable";

export type PickFeeAmountInput = {
  isReimbursable: boolean;
  hasReimbursableVariant: boolean;
  amount: number;
  amountReimbursable: number | null;
};

export type PickFeeAmountResult = {
  amount: number;
  variant: FeeAmountVariant;
};

export function pickFeeAmount(input: PickFeeAmountInput): PickFeeAmountResult {
  if (
    input.isReimbursable &&
    input.hasReimbursableVariant &&
    input.amountReimbursable != null
  ) {
    return { amount: input.amountReimbursable, variant: "reimbursable" };
  }
  return { amount: input.amount, variant: "standard" };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- pick-fee-amount`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/pick-fee-amount.ts src/lib/finance/pick-fee-amount.test.ts
git commit -m "feat(finance): add pickFeeAmount helper for dual-pricing logic"
```

---

## Phase 2: Data & Query Layer (Read Side)

### Task 3: Expose `hasReimbursableVariant` from fee-items data

**Files:**
- Modify: `src/lib/data/fee-items.ts`

- [ ] **Step 1: Add field to `FeeItemRow` type and select**

Replace `FeeItemRow` (lines 3-10):

```ts
export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
  sortOrder: number;
  hasReimbursableVariant: boolean;
};
```

In `listFeeItems`, update both SELECTs and both map blocks:

Primary path:
```ts
const { data, error } = await supabase
  .from("fee_items")
  .select(
    "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant",
  )
  .order("sort_order", { ascending: true })
  .order("name", { ascending: true });

if (!error && data) {
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    hasReimbursableVariant: row.has_reimbursable_variant,
  }));
}
```

Fallback path (also add the field, default false):
```ts
return fbData.map((row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isTuition: row.is_tuition,
  isActive: row.is_active,
  sortOrder: 0,
  hasReimbursableVariant: false,
}));
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit`
Expected: no new errors (existing consumers ignore extra field)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/fee-items.ts
git commit -m "feat(data): expose hasReimbursableVariant in FeeItemRow"
```

---

### Task 4: Expose dual-price fields in `FeeRateMatrix`

**Files:**
- Modify: `src/lib/data/fee-rates.ts`

- [ ] **Step 1: Update types and query**

Replace entire file:

```ts
import { feeRateKey } from "@/lib/finance/fee-rate-keys";
import { listFeeItems } from "@/lib/data/fee-items";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { createClient } from "@/lib/supabase/server";

export type FeeRateMatrixItem = {
  id: string;
  name: string;
  hasReimbursableVariant: boolean;
};

export type FeeRateMatrixCell = {
  id: string;
  amount: number;
  amountReimbursable: number | null;
};

export type FeeRateMatrix = {
  grades: { id: string; name: string }[];
  items: FeeRateMatrixItem[];
  rates: Record<string, FeeRateMatrixCell>;
};

export async function getFeeRateMatrix(semesterId: string): Promise<FeeRateMatrix> {
  const [grades, allItems, supabase] = await Promise.all([
    listGradeLevels(semesterId),
    listFeeItems(),
    createClient(),
  ]);

  const items: FeeRateMatrixItem[] = allItems
    .filter((i) => i.isActive)
    .map((i) => ({
      id: i.id,
      name: i.name,
      hasReimbursableVariant: i.hasReimbursableVariant,
    }));

  const { data: rateRows } = await supabase
    .from("fee_rates")
    .select("id, grade_level_id, fee_item_id, amount, amount_reimbursable")
    .eq("semester_id", semesterId);

  const rates: Record<string, FeeRateMatrixCell> = {};
  for (const row of rateRows ?? []) {
    rates[feeRateKey(row.grade_level_id, row.fee_item_id)] = {
      id: row.id,
      amount: Number(row.amount),
      amountReimbursable:
        row.amount_reimbursable != null ? Number(row.amount_reimbursable) : null,
    };
  }

  return {
    grades: grades.map((g) => ({ id: g.id, name: g.name })),
    items,
    rates,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in this file (downstream errors are expected — fixed in next tasks)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/fee-rates.ts
git commit -m "feat(data): expose amount_reimbursable in FeeRateMatrix"
```

---

### Task 5: Expose `isReimbursable` in invoice data layer

**Files:**
- Modify: `src/lib/data/invoices.ts`

- [ ] **Step 1: Add field to `InvoiceListRow` (line 9-25)**

```ts
export type InvoiceListRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  invoiceName: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: InvoiceStatus;
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  isReimbursable: boolean;
  createdAt: string;
  hasActivePaymentAllocation: boolean;
};
```

- [ ] **Step 2: Update SELECT and mapping in `listInvoicesPaginated`**

Add `is_reimbursable` to the select string (after `discount_value`):

```ts
.select(
  `
  id,
  student_id,
  invoice_name,
  subtotal,
  total_amount,
  paid_amount,
  status,
  discount_type,
  discount_value,
  is_reimbursable,
  created_at,
  students!inner ( student_code, first_name, last_name )
`,
  { count: "exact" },
)
```

Add `is_reimbursable: boolean;` to the inner `Row` type (line 129-141 area).

In the map block, add:
```ts
isReimbursable: row.is_reimbursable,
```
(before `createdAt`)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: this file has no new errors; downstream usages will be fixed later

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/invoices.ts
git commit -m "feat(data): expose is_reimbursable on InvoiceListRow"
```

---

### Task 6: Sync client queries with new fields

**Files:**
- Modify: `src/lib/queries/fee-rates.ts`
- Modify: `src/lib/queries/invoices.ts`

- [ ] **Step 1: Update `fetchFeeItems` in queries/fee-rates.ts**

In the primary path map:
```ts
return data.map((row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isTuition: row.is_tuition,
  isActive: row.is_active,
  sortOrder: row.sort_order,
  hasReimbursableVariant: row.has_reimbursable_variant,
}));
```

Update the select to include the new column:
```ts
.select("id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant")
```

In the fallback path map, add `hasReimbursableVariant: false`.

- [ ] **Step 2: Update `fetchFeeRateMatrix` in queries/fee-rates.ts**

Change the items select and mapping (mirror Task 4):
```ts
supabase
  .from("fee_items")
  .select(
    "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant",
  )
  .order("sort_order", { ascending: true })
  .order("name", { ascending: true }),
supabase
  .from("fee_rates")
  .select("id, grade_level_id, fee_item_id, amount, amount_reimbursable")
  .eq("semester_id", semesterId),
```

Replace rates loop:
```ts
const rates: Record<string, { id: string; amount: number; amountReimbursable: number | null }> = {};
for (const row of rateData ?? []) {
  rates[feeRateKey(row.grade_level_id, row.fee_item_id)] = {
    id: row.id,
    amount: Number(row.amount),
    amountReimbursable:
      row.amount_reimbursable != null ? Number(row.amount_reimbursable) : null,
  };
}
```

Replace `allItems` and `activeItems` mapping to include the new field:
```ts
const allItems = (itemData ?? []).map((row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isTuition: row.is_tuition,
  isActive: row.is_active,
  sortOrder: row.sort_order ?? 0,
  hasReimbursableVariant: row.has_reimbursable_variant,
}));

const activeItems = allItems
  .filter((i) => i.isActive)
  .map((i) => ({
    id: i.id,
    name: i.name,
    hasReimbursableVariant: i.hasReimbursableVariant,
  }));
```

- [ ] **Step 3: Update `fetchInvoicesPaginated` in queries/invoices.ts**

At the top of the file, update `InvoiceListRow` (lines 7-23) to add `isReimbursable: boolean;` before `createdAt: string;`:

```ts
export type InvoiceListRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  invoiceName: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: InvoiceStatus;
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  isReimbursable: boolean;
  createdAt: string;
  hasActivePaymentAllocation: boolean;
};
```

In `fetchInvoicesPaginated`, update the SELECT string to add `is_reimbursable` after `discount_value`:

```ts
.select(
  `
  id,
  student_id,
  invoice_name,
  subtotal,
  total_amount,
  paid_amount,
  status,
  discount_type,
  discount_value,
  is_reimbursable,
  created_at,
  students!inner ( student_code, first_name, last_name )
`,
  { count: "exact" },
)
```

Add `is_reimbursable: boolean;` to the inner `Row` type (after `discount_value`).

In the row map, add `isReimbursable: row.is_reimbursable,` before `createdAt`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in these files; UI files will be fixed in subsequent tasks

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/fee-rates.ts src/lib/queries/invoices.ts
git commit -m "feat(queries): sync client queries with dual-pricing fields"
```

---

## Phase 3: Fee Items Management UI

### Task 7: Update `fee-items` action signatures

**Files:**
- Modify: `src/lib/actions/fee-items.ts`

- [ ] **Step 1: Update `createFeeItem` input + insert**

Change function signature (line 14-18):
```ts
export async function createFeeItem(input: {
  name: string;
  description?: string;
  isTuition: boolean;
  hasReimbursableVariant: boolean;
}): Promise<ActionState> {
```

Update insert (around line 26-31):
```ts
const { error } = await supabase.from("fee_items").insert({
  name,
  description: input.description?.trim() || null,
  is_tuition: input.isTuition,
  is_active: true,
  has_reimbursable_variant: input.hasReimbursableVariant,
});
```

- [ ] **Step 2: Update `updateFeeItem` input + update**

Change function signature (line 39-47):
```ts
export async function updateFeeItem(
  id: string,
  input: {
    name: string;
    description?: string;
    isTuition: boolean;
    isActive: boolean;
    hasReimbursableVariant: boolean;
  },
): Promise<ActionState> {
```

Update the update payload:
```ts
.update({
  name,
  description: input.description?.trim() || null,
  is_tuition: input.isTuition,
  is_active: input.isActive,
  has_reimbursable_variant: input.hasReimbursableVariant,
})
```

- [ ] **Step 3: Type-check** — Run: `npx tsc --noEmit` — Expected: error only in `fee-items-section.tsx` (fixed next task)

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/fee-items.ts
git commit -m "feat(actions): accept hasReimbursableVariant in fee-item CRUD"
```

---

### Task 8: Fee items dialog + badge

**Files:**
- Modify: `src/components/finance/fee-items-section.tsx`

- [ ] **Step 1: Add state for the new flag**

After existing dialog state (after `setIsActive` at line 58), add:
```tsx
const [hasReimbursableVariant, setHasReimbursableVariant] = useState(false);
```

- [ ] **Step 2: Update `openCreate` (line 74-82)**

```tsx
function openCreate() {
  setMode("create");
  setEditTarget(null);
  setName("");
  setDescription("");
  setIsTuition(false);
  setIsActive(true);
  setHasReimbursableVariant(false);
  setDialogOpen(true);
}
```

- [ ] **Step 3: Update `openEdit` (line 84-92)**

```tsx
function openEdit(item: FeeItemRow) {
  setMode("edit");
  setEditTarget(item);
  setName(item.name);
  setDescription(item.description ?? "");
  setIsTuition(item.isTuition);
  setIsActive(item.isActive);
  setHasReimbursableVariant(item.hasReimbursableVariant);
  setDialogOpen(true);
}
```

- [ ] **Step 4: Pass the flag in `handleSubmit` (line 94-116)**

```tsx
const result =
  mode === "create"
    ? await createFeeItem({ name, description, isTuition, hasReimbursableVariant })
    : await updateFeeItem(editTarget!.id, {
        name,
        description,
        isTuition,
        isActive,
        hasReimbursableVariant,
      });
```

- [ ] **Step 5: Add badge in table row "ประเภท" cell (around line 289-293)**

Replace the current cell content:
```tsx
<TableCell>
  <div className="flex flex-wrap items-center gap-1">
    {item.isTuition ? (
      <Badge variant="secondary">ค่าเทอมหลัก</Badge>
    ) : (
      <span className="text-muted-foreground">รายการเพิ่มเติม</span>
    )}
    {item.hasReimbursableVariant ? (
      <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">2 ราคา</Badge>
    ) : null}
  </div>
</TableCell>
```

- [ ] **Step 6: Add checkbox in dialog (after the `isTuition` label, around line 368-376)**

Insert after the existing "เป็นค่าเทอมหลัก" Label:
```tsx
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

- [ ] **Step 7: Type-check + run tests**

Run: `npx tsc --noEmit && npm test`
Expected: all green

- [ ] **Step 8: Commit**

```bash
git add src/components/finance/fee-items-section.tsx
git commit -m "feat(ui): add reimbursable-variant toggle to fee item dialog"
```

---

## Phase 4: Fee Rates Matrix

### Task 9: Update `upsertFeeRates` to accept `amountReimbursable`

**Files:**
- Modify: `src/lib/actions/fee-rates.ts`

- [ ] **Step 1: Update `FeeRateUpsertEntry` (line 9-13)**

```ts
export type FeeRateUpsertEntry = {
  gradeLevelId: string;
  feeItemId: string;
  amount: number;
  amountReimbursable: number | null;
};
```

- [ ] **Step 2: Update validation + upsert (line 41-58)**

Replace the for-loop body:
```ts
for (const entry of entries) {
  if (entry.amount < 0) {
    return { ok: false, error: "จำนวนเงินต้องไม่ติดลบ" };
  }
  if (entry.amountReimbursable != null && entry.amountReimbursable < 0) {
    return { ok: false, error: "ราคาเบิกได้ต้องไม่ติดลบ" };
  }

  const { error } = await supabase.from("fee_rates").upsert(
    {
      academic_year_id: semester.academic_year_id,
      semester_id: semesterId,
      grade_level_id: entry.gradeLevelId,
      fee_item_id: entry.feeItemId,
      amount: entry.amount,
      amount_reimbursable: entry.amountReimbursable,
      receipt_type_id: receiptTypeId,
    },
    { onConflict: "academic_year_id,semester_id,grade_level_id,fee_item_id" },
  );

  if (error) return { ok: false, error: "ไม่สามารถบันทึกอัตราค่าธรรมเนียมได้" };
}
```

- [ ] **Step 3: Type-check** — Run: `npx tsc --noEmit` — Expected: only matrix UI file errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/fee-rates.ts
git commit -m "feat(actions): accept amountReimbursable in upsertFeeRates"
```

---

### Task 10: Fee rates matrix UI with dual inputs

**Files:**
- Modify: `src/components/finance/fee-rates-matrix.tsx`

- [ ] **Step 1: Update import and draft state shape**

Replace draft state (around line 30-40):
```tsx
type DraftCell = { amount: string; amountReimbursable: string };

const [draft, setDraft] = useState<Record<string, DraftCell>>(() => {
  const initial: Record<string, DraftCell> = {};
  for (const grade of matrix.grades) {
    for (const item of matrix.items) {
      const key = feeRateKey(grade.id, item.id);
      const cell = matrix.rates[key];
      initial[key] = {
        amount: cell?.amount != null ? String(cell.amount) : "",
        amountReimbursable:
          cell?.amountReimbursable != null ? String(cell.amountReimbursable) : "",
      };
    }
  }
  return initial;
});
```

- [ ] **Step 2: Update `gradeTotals` to use the new draft shape**

```tsx
const gradeTotals = useMemo(() => {
  const totals: Record<string, number> = {};
  for (const grade of matrix.grades) {
    let sum = 0;
    for (const item of matrix.items) {
      const raw = draft[feeRateKey(grade.id, item.id)]?.amount.trim() ?? "";
      const amount = Number.parseFloat(raw);
      if (Number.isFinite(amount) && amount > 0) sum += amount;
    }
    totals[grade.id] = sum;
  }
  return totals;
}, [draft, matrix]);
```

- [ ] **Step 3: Update `changedEntries` to detect both amounts changed**

```tsx
const changedEntries = useMemo(() => {
  const entries: FeeRateUpsertEntry[] = [];
  for (const grade of matrix.grades) {
    for (const item of matrix.items) {
      const key = feeRateKey(grade.id, item.id);
      const cell = draft[key];
      const rawAmount = cell?.amount.trim() ?? "";
      if (!rawAmount) continue;
      const amount = Number.parseFloat(rawAmount);
      if (!Number.isFinite(amount)) continue;

      let amountReimbursable: number | null = null;
      if (item.hasReimbursableVariant) {
        const rawReim = cell?.amountReimbursable.trim() ?? "";
        if (rawReim) {
          const parsed = Number.parseFloat(rawReim);
          if (Number.isFinite(parsed)) amountReimbursable = parsed;
        }
      }

      const previous = matrix.rates[key];
      if (
        previous &&
        previous.amount === amount &&
        previous.amountReimbursable === amountReimbursable
      ) {
        continue;
      }

      entries.push({
        gradeLevelId: grade.id,
        feeItemId: item.id,
        amount,
        amountReimbursable,
      });
    }
  }
  return entries;
}, [draft, matrix]);
```

- [ ] **Step 4: Update `updateCell` to set the right field**

Replace:
```tsx
function updateCell(
  key: string,
  field: "amount" | "amountReimbursable",
  value: string,
) {
  setDraft((prev) => ({
    ...prev,
    [key]: { ...prev[key], [field]: value },
  }));
}
```

- [ ] **Step 5: Update the table cell rendering (around line 140-153)**

Replace the inner `<TableCell>` (the matrix data cell) with:
```tsx
<TableCell key={item.id} className="text-right align-top">
  {item.hasReimbursableVariant ? (
    <div className="ml-auto flex w-[110px] flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="w-12 text-left text-[10px] text-muted-foreground">ปกติ</span>
        <Input
          type="number"
          min={0}
          step="0.01"
          className="tabular-nums"
          value={draft[key]?.amount ?? ""}
          onChange={(e) => updateCell(key, "amount", e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="w-12 text-left text-[10px] text-sky-700">เบิกได้</span>
        <Input
          type="number"
          min={0}
          step="0.01"
          className="tabular-nums"
          value={draft[key]?.amountReimbursable ?? ""}
          onChange={(e) => updateCell(key, "amountReimbursable", e.target.value)}
          placeholder="(ว่าง = ใช้ราคาปกติ)"
        />
      </div>
    </div>
  ) : (
    <Input
      type="number"
      min={0}
      step="0.01"
      className="ml-auto w-[110px] tabular-nums"
      value={draft[key]?.amount ?? ""}
      onChange={(e) => updateCell(key, "amount", e.target.value)}
      placeholder="0"
    />
  )}
</TableCell>
```

- [ ] **Step 6: Update header label hint**

After `<TableHead>` for each item (around line 127-131), tweak header to show 2 ราคา badge:
```tsx
<TableHead key={item.id} className="min-w-[180px] text-right">
  <div className="flex items-center justify-end gap-1">
    <span>{item.name}</span>
    {item.hasReimbursableVariant ? (
      <span className="rounded bg-sky-50 px-1 text-[10px] text-sky-700">2 ราคา</span>
    ) : null}
  </div>
</TableHead>
```

- [ ] **Step 7: Type-check + run tests + manual visual**

Run: `npx tsc --noEmit && npm test`
Expected: green
Manual: open `/fee-rates`, mark a fee item as dual-pricing, verify cell shows 2 inputs

- [ ] **Step 8: Commit**

```bash
git add src/components/finance/fee-rates-matrix.tsx
git commit -m "feat(ui): render dual-price inputs in fee rates matrix"
```

---

## Phase 5: Invoice Generation

### Task 11: `generateInvoices` — accept per-student variant + apply `pickFeeAmount`

**Files:**
- Modify: `src/lib/actions/invoices.ts`

- [ ] **Step 1: Update imports**

Add at top:
```ts
import { pickFeeAmount } from "@/lib/finance/pick-fee-amount";
```

- [ ] **Step 2: Update `GenerateInput` type (line 15-22)**

```ts
type GenerateInput = {
  semesterId: string;
  academicYearId: string;
  academicYearName: string;
  semesterNumber: number;
  feeItemIds: string[];
  studentIds?: string[];
  reimbursableStudentIds?: string[];
};
```

- [ ] **Step 3: Update the rate query and `RateRow` type (line 84-104)**

```ts
const { data: rateRows } = await supabase
  .from("fee_rates")
  .select(
    "grade_level_id, fee_item_id, amount, amount_reimbursable, fee_items(name, has_reimbursable_variant)",
  )
  .eq("semester_id", input.semesterId)
  .in("fee_item_id", input.feeItemIds);

type RateRow = {
  grade_level_id: string;
  fee_item_id: string;
  amount: number;
  amount_reimbursable: number | null;
  fee_items: { name: string; has_reimbursable_variant: boolean } | null;
};

const rates = (rateRows ?? []) as unknown as RateRow[];

type RateMapEntry = {
  amount: number;
  amountReimbursable: number | null;
  name: string;
  hasReimbursableVariant: boolean;
};

const rateMap = new Map<string, RateMapEntry>();
for (const rate of rates) {
  rateMap.set(`${rate.grade_level_id}:${rate.fee_item_id}`, {
    amount: Number(rate.amount),
    amountReimbursable:
      rate.amount_reimbursable != null ? Number(rate.amount_reimbursable) : null,
    name: rate.fee_items?.name ?? "",
    hasReimbursableVariant: rate.fee_items?.has_reimbursable_variant ?? false,
  });
}
```

- [ ] **Step 4: Build reimbursable lookup set + use pickFeeAmount in the loop (line 106-169)**

Add before the for-loop:
```ts
const reimbursableSet = new Set(input.reimbursableStudentIds ?? []);
```

Replace the line-building inside the loop:
```ts
const isReimbursable = reimbursableSet.has(enrollment.studentId);
const lines: {
  fee_item_id: string;
  description: string;
  amount: number;
  variant: "standard" | "reimbursable";
}[] = [];

for (const feeItemId of input.feeItemIds) {
  const rate = rateMap.get(`${enrollment.gradeLevelId}:${feeItemId}`);
  if (!rate) continue;
  const picked = pickFeeAmount({
    isReimbursable,
    hasReimbursableVariant: rate.hasReimbursableVariant,
    amount: rate.amount,
    amountReimbursable: rate.amountReimbursable,
  });
  lines.push({
    fee_item_id: feeItemId,
    description: rate.name,
    amount: picked.amount,
    variant: picked.variant,
  });
}
```

Then in the `student_invoices` insert, add `is_reimbursable`:
```ts
.insert({
  student_id: enrollment.studentId,
  academic_year_id: input.academicYearId,
  semester_id: input.semesterId,
  invoice_name: invoiceName,
  subtotal,
  total_amount: totalAmount,
  paid_amount: 0,
  status: "unpaid",
  is_reimbursable: isReimbursable,
})
```

In the `invoice_lines` insert, add `variant`:
```ts
const { error: linesError } = await supabase.from("invoice_lines").insert(
  lines.map((line) => ({
    invoice_id: invoice.id,
    fee_item_id: line.fee_item_id,
    description: line.description,
    amount: line.amount,
    variant: line.variant,
  })),
);
```

- [ ] **Step 5: Type-check + run tests** — Run: `npx tsc --noEmit && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/invoices.ts src/lib/finance/pick-fee-amount.ts
git commit -m "feat(actions): apply per-student variant in generateInvoices"
```

---

### Task 12: Invoice generate dialog — per-student tick

**Files:**
- Modify: `src/components/finance/invoice-generate-dialog.tsx`

- [ ] **Step 1: Add state for reimbursable per student**

After existing state hooks (after `setSubmitting`, around line 55), add:
```tsx
const [reimbursableStudentIds, setReimbursableStudentIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Add helpers**

```tsx
function toggleReimbursable(id: string) {
  setReimbursableStudentIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function setAllReimbursable(value: boolean) {
  if (!value) {
    setReimbursableStudentIds(new Set());
    return;
  }
  if (mode === "selected") {
    setReimbursableStudentIds(new Set(selectedStudentIds));
  } else {
    setReimbursableStudentIds(
      new Set(selectableCandidates.map((c) => c.studentId)),
    );
  }
}
```

- [ ] **Step 3: Pass to action in `handleSubmit`**

In the call to `generateInvoices` (around line 101-108), add:
```tsx
const result = await generateInvoices({
  semesterId,
  academicYearId,
  academicYearName,
  semesterNumber,
  feeItemIds,
  studentIds,
  reimbursableStudentIds: [...reimbursableStudentIds],
});
```

- [ ] **Step 4: Add bulk "เบิกได้" controls + per-row checkbox in the selected list (line 173-203)**

Replace the entire `{mode === "selected" ? ...` block with:
```tsx
{mode === "selected" ? (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label>นักเรียน (ยังไม่มีใบ)</Label>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={selectAllStudents}>
          เลือกทั้งหมด
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAllReimbursable(true)}>
          ตั้งเบิกได้ทุกคน
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAllReimbursable(false)}>
          ล้างเบิกได้
        </Button>
      </div>
    </div>
    <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
      {selectableCandidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีนักเรียนที่สร้างใบได้</p>
      ) : (
        selectableCandidates.map((c) => (
          <div
            key={c.studentId}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <Label className="flex cursor-pointer items-center gap-2 font-normal">
              <input
                type="checkbox"
                className="size-4 rounded border-border accent-primary"
                checked={selectedStudentIds.has(c.studentId)}
                onChange={() => toggleStudent(c.studentId)}
              />
              <span className="tabular-nums">{c.studentCode}</span>
              <span>{c.studentName}</span>
              <span className="text-muted-foreground">({c.gradeClassroom})</span>
            </Label>
            <Label className="flex cursor-pointer items-center gap-1 text-xs text-sky-700">
              <input
                type="checkbox"
                className="size-3.5 rounded border-border accent-sky-600"
                checked={reimbursableStudentIds.has(c.studentId)}
                onChange={() => toggleReimbursable(c.studentId)}
              />
              เบิกได้
            </Label>
          </div>
        ))
      )}
    </div>
  </div>
) : (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label>ระบุ &quot;เบิกได้&quot; ในโหมดทั้งภาค</Label>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setAllReimbursable(true)}>
          ตั้งเบิกได้ทุกคน
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setAllReimbursable(false)}>
          ล้างเบิกได้
        </Button>
      </div>
    </div>
    <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
      {selectableCandidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีนักเรียนที่สร้างใบได้</p>
      ) : (
        selectableCandidates.map((c) => (
          <Label
            key={c.studentId}
            className="flex cursor-pointer items-center justify-between gap-2 text-sm font-normal"
          >
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{c.studentCode}</span>
              <span>{c.studentName}</span>
              <span className="text-muted-foreground">({c.gradeClassroom})</span>
            </span>
            <span className="flex items-center gap-1 text-xs text-sky-700">
              <input
                type="checkbox"
                className="size-3.5 rounded border-border accent-sky-600"
                checked={reimbursableStudentIds.has(c.studentId)}
                onChange={() => toggleReimbursable(c.studentId)}
              />
              เบิกได้
            </span>
          </Label>
        ))
      )}
    </div>
  </div>
)}
```

- [ ] **Step 5: Type-check** — Run: `npx tsc --noEmit` — Expected: green

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/invoice-generate-dialog.tsx
git commit -m "feat(ui): per-student reimbursable toggle in invoice generate dialog"
```

---

## Phase 6: Edit Variant After Creation

### Task 13: `updateInvoiceReimbursable` action with TDD

**Files:**
- Modify: `src/lib/actions/invoices.ts`

- [ ] **Step 1: Add action at the bottom of the file**

Before `revalidateFinancePaths`:
```ts
export async function updateInvoiceReimbursable(
  invoiceId: string,
  isReimbursable: boolean,
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("student_invoices")
    .select("id, semester_id, paid_amount, discount_type, discount_value, student_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "ไม่พบใบแจ้งชำระ" };
  if (Number(invoice.paid_amount) > 0) {
    return { ok: false, error: "ไม่สามารถเปลี่ยนประเภทราคาหลังมีการชำระแล้ว" };
  }

  // Lookup grade for the student in this semester
  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("classroom_id, classrooms!inner(grade_level_id)")
    .eq("student_id", invoice.student_id)
    .eq("semester_id", invoice.semester_id)
    .eq("status", "enrolled")
    .maybeSingle();

  type EnrollmentRow = {
    classroom_id: string;
    classrooms: { grade_level_id: string };
  };
  const gradeLevelId =
    (enrollment as unknown as EnrollmentRow | null)?.classrooms.grade_level_id;
  if (!gradeLevelId) {
    return { ok: false, error: "ไม่พบชั้นเรียนของนักเรียน" };
  }

  // Load existing lines (we need fee_item_id to look up new amount)
  const { data: existingLines } = await supabase
    .from("invoice_lines")
    .select("id, fee_item_id, description")
    .eq("invoice_id", invoiceId);

  if (!existingLines || existingLines.length === 0) {
    return { ok: false, error: "ใบแจ้งชำระไม่มีรายการ" };
  }

  const feeItemIds = existingLines.map((l) => l.fee_item_id);

  const { data: rateRows } = await supabase
    .from("fee_rates")
    .select(
      "fee_item_id, amount, amount_reimbursable, fee_items(has_reimbursable_variant)",
    )
    .eq("semester_id", invoice.semester_id)
    .eq("grade_level_id", gradeLevelId)
    .in("fee_item_id", feeItemIds);

  type RateRow = {
    fee_item_id: string;
    amount: number;
    amount_reimbursable: number | null;
    fee_items: { has_reimbursable_variant: boolean } | null;
  };

  const rateMap = new Map<string, RateRow>();
  for (const row of (rateRows ?? []) as unknown as RateRow[]) {
    rateMap.set(row.fee_item_id, row);
  }

  let subtotal = 0;
  for (const line of existingLines) {
    const rate = rateMap.get(line.fee_item_id);
    if (!rate) {
      return { ok: false, error: "ไม่พบอัตราค่าธรรมเนียมของบางรายการ" };
    }
    const picked = pickFeeAmount({
      isReimbursable,
      hasReimbursableVariant: rate.fee_items?.has_reimbursable_variant ?? false,
      amount: Number(rate.amount),
      amountReimbursable:
        rate.amount_reimbursable != null ? Number(rate.amount_reimbursable) : null,
    });
    subtotal += picked.amount;

    const { error: lineError } = await supabase
      .from("invoice_lines")
      .update({ amount: picked.amount, variant: picked.variant })
      .eq("id", line.id);
    if (lineError) {
      return { ok: false, error: "ไม่สามารถปรับรายการในใบแจ้งชำระได้" };
    }
  }

  const totalAmount = computeInvoiceTotal(
    subtotal,
    invoice.discount_type as "percent" | "fixed" | null,
    invoice.discount_value != null ? Number(invoice.discount_value) : null,
  );

  const { error: invoiceError } = await supabase
    .from("student_invoices")
    .update({
      is_reimbursable: isReimbursable,
      subtotal,
      total_amount: totalAmount,
      status: "unpaid",
    })
    .eq("id", invoiceId);

  if (invoiceError) {
    return { ok: false, error: "ไม่สามารถบันทึกการเปลี่ยนแปลงได้" };
  }

  revalidateFinancePaths();
  return { ok: true };
}
```

- [ ] **Step 2: Type-check** — Run: `npx tsc --noEmit` — Expected: green

- [ ] **Step 3: Manual smoke test plan**

After UI is added (Task 14), verify:
- Toggle on/off swaps line amounts to/from reimbursable values
- Returns error when invoice has `paid_amount > 0`

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/invoices.ts
git commit -m "feat(actions): add updateInvoiceReimbursable with re-snapshot"
```

---

### Task 14: Reimbursable toggle dialog

**Files:**
- Create: `src/components/finance/invoice-reimbursable-dialog.tsx`

- [ ] **Step 1: Create dialog**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateInvoiceReimbursable } from "@/lib/actions/invoices";
import type { InvoiceListRow } from "@/lib/data/invoices";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceListRow | null;
};

export function InvoiceReimbursableDialog({ open, onOpenChange, invoice }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  if (!invoice) return null;

  const targetValue = !invoice.isReimbursable;
  const targetLabel = targetValue ? "เบิกได้" : "เบิกไม่ได้";

  async function handleConfirm() {
    setSubmitting(true);
    const result = await updateInvoiceReimbursable(invoice!.id, targetValue);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`เปลี่ยนเป็นราคา ${targetLabel} แล้ว`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เปลี่ยนประเภทราคา</DialogTitle>
          <DialogDescription>
            {invoice.studentName} — เปลี่ยนเป็นราคา <b>{targetLabel}</b>?
            <br />
            ระบบจะคำนวณยอดในใบใหม่ตามอัตราปัจจุบัน
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check** — Run: `npx tsc --noEmit` — Expected: green

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/invoice-reimbursable-dialog.tsx
git commit -m "feat(ui): add invoice reimbursable toggle dialog"
```

---

## Phase 7: Display & Filter on Invoices Panel

### Task 15: Add badge, filter, and edit button on invoices panel

**Files:**
- Modify: `src/components/finance/invoices-panel.tsx`

- [ ] **Step 1: Update queries client type**

Edit `src/lib/queries/invoices.ts` — make sure `InvoiceListRow` exports include `isReimbursable: boolean` (done in Task 6).

- [ ] **Step 2: Add import**

In `src/components/finance/invoices-panel.tsx`:
```tsx
import { InvoiceReimbursableDialog } from "@/components/finance/invoice-reimbursable-dialog";
```

- [ ] **Step 3: Add variant filter constant + state**

After `STATUS_FILTER_ITEMS` (around line 58), add:
```tsx
const REIMBURSABLE_FILTER_ITEMS = [
  { value: "all", label: "ทุกประเภท" },
  { value: "reimbursable", label: "เบิกได้" },
  { value: "standard", label: "เบิกไม่ได้" },
];
```

In the component, parse the search param:
```tsx
const reimbursableParam = searchParams.get("reimbursable") ?? "all";
```

And add to `pushParams` keys, and a `useEffect` dependency.

- [ ] **Step 4: Add reimbursable target state and Select UI**

After `discountTarget` state, add:
```tsx
const [reimbursableTarget, setReimbursableTarget] = useState<InvoiceListRow | null>(null);
```

Add a `<Select>` next to the status filter (around line 290):
```tsx
<Select
  value={reimbursableParam}
  onValueChange={(v) => pushParams({ reimbursable: v ?? "all", page: 1 })}
  items={REIMBURSABLE_FILTER_ITEMS}
>
  <SelectTrigger className="w-[140px]">
    <SelectValue placeholder="ประเภท" />
  </SelectTrigger>
  <SelectContent>
    {REIMBURSABLE_FILTER_ITEMS.map((item) => (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Update `pushParams` to support `reimbursable`:
```tsx
const pushParams = useCallback(
  (next: Partial<{
    q: string;
    status: string;
    grade: string;
    classroom: string;
    reimbursable: string;
    page: number;
  }>) => {
    const query = new URLSearchParams();
    const q = (next.q ?? qParam).trim();
    const newStatus = next.status ?? statusParam;
    const grade = next.grade ?? gradeParam;
    const classroom = next.classroom ?? classroomParam;
    const reimbursable = next.reimbursable ?? reimbursableParam;
    const page = next.page ?? pageParam;

    if (q) query.set("q", q);
    if (newStatus && newStatus !== "all") query.set("status", newStatus);
    if (grade && grade !== "all") query.set("grade", grade);
    if (classroom && classroom !== "all") query.set("classroom", classroom);
    if (reimbursable && reimbursable !== "all") query.set("reimbursable", reimbursable);
    query.set("page", String(Math.max(1, page)));

    const yearSemester = new URLSearchParams(window.location.search);
    if (yearSemester.get("year")) query.set("year", yearSemester.get("year")!);
    if (yearSemester.get("semester")) query.set("semester", yearSemester.get("semester")!);

    startTransition(() => {
      router.push(`${pathname}?${query.toString()}`);
    });
  },
  [qParam, statusParam, gradeParam, classroomParam, reimbursableParam, pageParam, pathname, router, startTransition],
);
```

- [ ] **Step 5: Filter rows on client side**

Just below `data = invoicesData ?? ...` and before `deletableRows`, add:
```tsx
const filteredRows = useMemo(() => {
  if (reimbursableParam === "reimbursable") {
    return data.rows.filter((r) => r.isReimbursable);
  }
  if (reimbursableParam === "standard") {
    return data.rows.filter((r) => !r.isReimbursable);
  }
  return data.rows;
}, [data.rows, reimbursableParam]);
```

Replace every `data.rows.map(...)` and `data.rows.length` referring to the rendered list with `filteredRows`.

- [ ] **Step 6: Add badge next to student name in both mobile and desktop views**

Mobile (in the truncate `<p>` containing studentName, around line 371):
```tsx
<div className="flex items-center gap-2">
  <p className="truncate font-medium">{row.studentName}</p>
  {row.isReimbursable ? (
    <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">เบิกได้</Badge>
  ) : null}
</div>
```

Desktop (in the `<TableCell>{row.studentName}</TableCell>` around line 480):
```tsx
<TableCell>
  <div className="flex items-center gap-2">
    <span>{row.studentName}</span>
    {row.isReimbursable ? (
      <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">เบิกได้</Badge>
    ) : null}
  </div>
</TableCell>
```

- [ ] **Step 7: Add "ราคาเบิกได้" action button**

In the action button cell (around line 495-525, desktop) add another button before the delete:
```tsx
{row.paidAmount === 0 ? (
  <Button
    type="button"
    size="sm"
    variant="outline"
    onClick={() => setReimbursableTarget(row)}
  >
    {row.isReimbursable ? "เปลี่ยนเป็นเบิกไม่ได้" : "เปลี่ยนเป็นเบิกได้"}
  </Button>
) : null}
```

Same in the mobile card view.

- [ ] **Step 8: Mount the dialog**

Below the existing `<InvoiceDiscountDialog ...>`:
```tsx
<InvoiceReimbursableDialog
  open={Boolean(reimbursableTarget)}
  onOpenChange={(open) => !open && setReimbursableTarget(null)}
  invoice={reimbursableTarget}
/>
```

- [ ] **Step 9: Type-check + run tests + manual smoke**

Run: `npx tsc --noEmit && npm test`
Expected: all green

Manual:
- `/invoices` shows filter
- Switching filter narrows list
- Badge shows on reimbursable rows
- Clicking "เปลี่ยนเป็น..." opens dialog and toggles successfully
- Cannot toggle when paid_amount > 0 (button hidden)

- [ ] **Step 10: Commit**

```bash
git add src/components/finance/invoices-panel.tsx
git commit -m "feat(ui): show reimbursable badge + filter + toggle on invoices panel"
```

---

## Phase 8: Reports

### Task 16: Add variant filter to outstanding report

(Collections report is aggregated by grade — variant filter does not apply meaningfully there. Skip collections.)

**Files:**
- Modify: `src/lib/data/reports.ts`
- Modify: `src/lib/queries/reports.ts`
- Modify: `src/components/finance/outstanding-report-panel.tsx`

- [ ] **Step 1: Add `variant` param + display field in `OutstandingReportRow`**

In `src/lib/data/reports.ts`, update the type (lines 5-16):

```ts
export type OutstandingReportRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  subtotal: number;
  discountLabel: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
  isReimbursable: boolean;
};
```

Update `listOutstandingReport` params (lines 35-42) to add `variant`:

```ts
export async function listOutstandingReport(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  variant?: "standard" | "reimbursable" | "all";
  teacherProfileId?: string;
}): Promise<OutstandingReportRow[]> {
```

Update the SELECT inside `listOutstandingReport` — add `is_reimbursable` to the select string (after `status,`):

```ts
.select(
  `
  student_id,
  subtotal,
  discount_type,
  discount_value,
  total_amount,
  paid_amount,
  status,
  is_reimbursable,
  students!inner ( student_code, first_name, last_name )
`,
)
```

After the `params.status` block (around line 113), add filter:

```ts
if (params.variant === "reimbursable") {
  query = query.eq("is_reimbursable", true);
} else if (params.variant === "standard") {
  query = query.eq("is_reimbursable", false);
}
```

Update the `Row` type (line 121-130) to add `is_reimbursable: boolean;`.

Update the mapping (line 132-148) to include `isReimbursable: row.is_reimbursable,` before `status` in the returned object.

- [ ] **Step 2: Mirror the same changes in `src/lib/queries/reports.ts`**

Apply identical edits to:
- `OutstandingReportRow` type (lines 4-15)
- `fetchOutstandingReport` params signature (lines 68-75)
- SELECT (lines 124-137) — add `is_reimbursable,`
- Add variant filter after the status block (around line 146)
- `Row` type (lines 154-163) — add `is_reimbursable: boolean;`
- Map (lines 165-181) — add `isReimbursable: row.is_reimbursable,`

- [ ] **Step 3: Update outstanding report panel UI**

In `src/components/finance/outstanding-report-panel.tsx`:

Add constant near `STATUS_ITEMS`:
```tsx
const REIMBURSABLE_ITEMS = [
  { value: "all", label: "ทุกประเภท" },
  { value: "reimbursable", label: "เบิกได้" },
  { value: "standard", label: "เบิกไม่ได้" },
];
```

Parse the search param near other `searchParams.get`:
```tsx
const variantParam = searchParams.get("variant") ?? "all";
const variantValue: "all" | "standard" | "reimbursable" =
  variantParam === "reimbursable" || variantParam === "standard"
    ? variantParam
    : "all";
```

Add `variantValue` to the query key + queryFn:
```tsx
const { data: rows = [], isLoading: rowsLoading } = useQuery({
  queryKey: [
    "outstanding-report",
    ctx?.semesterId,
    ctx?.academicYearId,
    gradeParam,
    classroomParam,
    statusParam,
    variantValue,
    teacherProfileId,
  ],
  queryFn: () =>
    fetchOutstandingReport({
      semesterId: ctx!.semesterId,
      academicYearId: ctx!.academicYearId,
      gradeLevelId: gradeParam !== "all" ? gradeParam : undefined,
      classroomId: classroomParam !== "all" ? classroomParam : undefined,
      status: statusParam,
      variant: variantValue,
      teacherProfileId,
    }),
  enabled: !!ctx,
});
```

Extend `params` shape and `pushParams`:
```tsx
const params = {
  grade: gradeParam,
  classroom: classroomParam,
  status: statusParam,
  variant: variantValue,
};

const pushParams = useCallback(
  (next: Partial<typeof params>) => {
    const query = new URLSearchParams(window.location.search);
    const grade = next.grade ?? params.grade;
    const classroom = next.classroom ?? params.classroom;
    const status = next.status ?? params.status;
    const variant = next.variant ?? params.variant;

    if (grade !== "all") query.set("grade", grade);
    else query.delete("grade");
    if (classroom !== "all") query.set("classroom", classroom);
    else query.delete("classroom");
    if (status !== "all") query.set("status", status);
    else query.delete("status");
    if (variant !== "all") query.set("variant", variant);
    else query.delete("variant");

    router.push(`${pathname}?${query.toString()}`);
  },
  [params, pathname, router],
);
```

Add the filter `<Select>` near the status select (inside the `<div className="flex flex-wrap gap-2">`):
```tsx
<Select
  value={params.variant}
  onValueChange={(v) => pushParams({ variant: (v ?? "all") as typeof params.variant })}
  items={REIMBURSABLE_ITEMS}
>
  <SelectTrigger className="w-[140px]">
    <SelectValue placeholder="ประเภท" />
  </SelectTrigger>
  <SelectContent>
    {REIMBURSABLE_ITEMS.map((item) => (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Add a small badge next to student name in both mobile card and desktop table — e.g., next to `{row.studentName}`:
```tsx
{row.isReimbursable ? (
  <Badge className="ml-1 bg-sky-50 text-sky-700 hover:bg-sky-50">เบิกได้</Badge>
) : null}
```

- [ ] **Step 4: Type-check + tests** — Run: `npx tsc --noEmit && npm test` — Expected: green

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/reports.ts src/lib/queries/reports.ts src/components/finance/outstanding-report-panel.tsx
git commit -m "feat(reports): add reimbursable variant filter to outstanding report"
```

---

## Final Verification

### Task 17: End-to-end manual test

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Walk the full flow**

1. Login as admin
2. `/fee-rates` → "เพิ่มรายการ" → ติ๊ก "มีราคาเบิกได้แยก" → save
3. Edit fee rates matrix → กรอกราคาปกติและราคาเบิกได้ในชั้นใดชั้นหนึ่ง → save
4. `/invoices` → "สร้างใบแจ้งชำระ" → เลือก mode "เลือกเฉพาะ" → ติ๊กนักเรียน 2 คน → ติ๊ก "เบิกได้" ของคนเดียว → ยืนยัน
5. ตารางใบแจ้งชำระ:
   - คนที่ติ๊กเบิกได้ → badge "เบิกได้" + ยอดตรงราคาเบิกได้
   - อีกคน → ไม่มี badge + ยอดเท่าราคาปกติ
6. กดปุ่ม "เปลี่ยนเป็นเบิกได้/ไม่ได้" → ยอดเปลี่ยนทันที
7. รับชำระเงินบางส่วน → กดปุ่มเปลี่ยน variant → ขึ้น error "ไม่สามารถเปลี่ยนประเภทราคาหลังมีการชำระแล้ว"
8. Print receipt → ไม่แสดง label เบิกได้
9. Filter ใน `/invoices` ทำงาน
10. Filter ในรายงานทำงาน

- [ ] **Step 3: Run full test + type-check**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all green

- [ ] **Step 4: Final commit (if anything tweaked)**

```bash
git add -A
git commit -m "chore: tidy up after manual E2E verification"
```

---

## Notes for the Engineer

- **TDD only for pure functions** — `pickFeeAmount` is the only fully isolated pure function in this plan. UI changes verified by type-check + manual smoke.
- **Snapshot vs computed** — `invoice_lines.variant` and `invoice_lines.amount` are snapshots set at create/update time. They do NOT update when fee_rates changes later. Re-snapshot only happens when `updateInvoiceReimbursable` is called.
- **Fallback rule** — if `amount_reimbursable` is null on a fee_rate but the item has `has_reimbursable_variant=true`, `pickFeeAmount` returns the standard amount with `variant='standard'`. This is intentional (per spec).
- **Receipt UI unchanged** — do not touch `receipt-dialog.tsx`. The printed receipt deliberately omits the variant label per spec.
- **`is_reimbursable` is per-invoice** — once stored, all lines in that invoice follow the same variant decision. There is no per-line override.

