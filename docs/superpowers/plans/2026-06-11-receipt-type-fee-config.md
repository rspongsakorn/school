# Receipt-Type Fee Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind each fee item to exactly one receipt type, move fee configuration from the standalone `/fee-rates` page into a per-receipt-type pop-up, and make invoices and receipts carry their receipt type through generation and payment.

**Architecture:** Add `receipt_type_id` to `fee_items` and `student_invoices` (backfilled to default type `"01"`). Scope the existing fee-item list and fee-rate matrix components to a `receiptTypeId` and render them inside a large dialog launched from the receipt-types table. Add a receipt-type selector to invoice generation. Rework payment from student-level FIFO to single-invoice payment so each receipt maps to one invoice and inherits its receipt type.

**Tech Stack:** Next.js (App Router) server actions, Supabase (Postgres) via `@supabase/supabase-js`, React Query, `@hello-pangea/dnd`, Vitest for pure-logic unit tests, Tailwind + shadcn-style UI.

**Testing reality for this repo:** Pure functions under `src/lib/finance` and `src/lib/**` have Vitest unit tests. Server actions and data functions talk to Supabase and are **not** unit-tested here — they are verified with `npx tsc --noEmit`, `npm run lint`, and manual preview. The plan uses TDD for new pure logic and type/lint/preview verification for DB, server-action, and UI work. Be honest in commits about which kind of verification ran.

---

## File Structure

**New files**
- `supabase/migrations/20260611000000_fee_items_receipt_type.sql` — add + backfill + NOT NULL `fee_items.receipt_type_id`
- `supabase/migrations/20260611000100_student_invoices_receipt_type.sql` — add + backfill `student_invoices.receipt_type_id`
- `src/components/finance/receipt-type-fee-dialog.tsx` — the per-type fee-config pop-up (composes `FeeItemsSection` + `FeeRatesMatrix`)
- `src/lib/finance/single-invoice-allocation.ts` — pure helper for single-invoice payment amount validation/derivation
- `src/lib/finance/single-invoice-allocation.test.ts` — its unit tests

**Modified files**
- `src/lib/data/fee-items.ts` — `FeeItemRow.receiptTypeId`; `listFeeItems(receiptTypeId?)`
- `src/lib/queries/fee-rates.ts` — `fetchFeeItems(receiptTypeId)`; `fetchFeeRateMatrix(semesterId, receiptTypeId)`
- `src/lib/data/fee-rates.ts` — `getFeeRateMatrix(semesterId, receiptTypeId)`
- `src/lib/actions/fee-items.ts` — `createFeeItem` requires `receiptTypeId`; revalidate `/receipt-types`
- `src/components/finance/fee-items-section.tsx` — accept `receiptTypeId`, pass on create, invalidate per-type queries
- `src/components/finance/fee-rates-matrix.tsx` — unchanged logic, but now receives type-scoped matrix (no signature change)
- `src/components/finance/receipt-types-panel.tsx` — add "ตั้งค่าค่าธรรมเนียม" button + launch dialog
- `src/lib/data/invoices.ts` — `InvoiceListRow.receiptTypeId`; select it
- `src/lib/actions/invoices.ts` — `generateInvoices` takes `receiptTypeId`, writes it
- `src/components/finance/invoice-generate-dialog.tsx` — receipt-type selector + filter fee items by type
- `src/lib/actions/payments.ts` — `recordPayment` takes `invoiceId`; single-invoice allocation; receipt type from invoice; CSV backfill derives type from invoice
- `src/components/finance/invoice-payment-dialog.tsx` — pay only the clicked invoice
- `src/components/app-sidebar.tsx` — remove `/fee-rates` nav entry

**Deleted files**
- `src/app/(dashboard)/fee-rates/page.tsx`
- `src/components/finance/fee-rates-page-panel.tsx`

---

## Task 1: Migration — add `receipt_type_id` to `fee_items`

**Files:**
- Create: `supabase/migrations/20260611000000_fee_items_receipt_type.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add receipt_type_id to fee_items (each fee item belongs to exactly one receipt type)
ALTER TABLE public.fee_items
  ADD COLUMN receipt_type_id uuid REFERENCES public.receipt_types(id);

-- Backfill existing rows to the default receipt type (code '01')
UPDATE public.fee_items
SET receipt_type_id = (
  SELECT id FROM public.receipt_types WHERE code = '01' LIMIT 1
)
WHERE receipt_type_id IS NULL;

-- Enforce NOT NULL now that all rows are backfilled
ALTER TABLE public.fee_items
  ALTER COLUMN receipt_type_id SET NOT NULL;

-- Index for per-type listing/filtering
CREATE INDEX IF NOT EXISTS idx_fee_items_receipt_type_id
  ON public.fee_items (receipt_type_id);
```

- [ ] **Step 2: Apply and verify**

Run: `npm run db:reset`
Expected: reset completes with no error; the new migration is applied. (If a local Supabase is not running, start it with `npm run db:start` first.)

Then verify the column exists and is backfilled:

Run: `npx supabase db reset` is already covered; to spot-check, open Supabase Studio (`http://localhost:54323`) → `fee_items` → confirm every row has a non-null `receipt_type_id` matching the `'01'` type.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260611000000_fee_items_receipt_type.sql
git commit -m "feat(db): add receipt_type_id to fee_items"
```

---

## Task 2: Migration — add `receipt_type_id` to `student_invoices`

**Files:**
- Create: `supabase/migrations/20260611000100_student_invoices_receipt_type.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add receipt_type_id to student_invoices (one invoice = one receipt type)
ALTER TABLE public.student_invoices
  ADD COLUMN receipt_type_id uuid REFERENCES public.receipt_types(id);

-- Backfill existing invoices to the default receipt type (code '01')
UPDATE public.student_invoices
SET receipt_type_id = (
  SELECT id FROM public.receipt_types WHERE code = '01' LIMIT 1
)
WHERE receipt_type_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_invoices_receipt_type_id
  ON public.student_invoices (receipt_type_id);
```

Note: left nullable (no `SET NOT NULL`) so that any in-flight insert paths that have not yet been updated do not hard-fail before Task 9. Task 9 always supplies the value going forward.

- [ ] **Step 2: Apply and verify**

Run: `npm run db:reset`
Expected: reset completes; `student_invoices` rows all have `receipt_type_id` set to the `'01'` type.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260611000100_student_invoices_receipt_type.sql
git commit -m "feat(db): add receipt_type_id to student_invoices"
```

---

## Task 3: Data layer — `FeeItemRow.receiptTypeId` and per-type listing

**Files:**
- Modify: `src/lib/data/fee-items.ts`

- [ ] **Step 1: Add `receiptTypeId` to the type and an optional filter to `listFeeItems`**

Replace the whole file body with:

```ts
import { createClient } from "@/lib/supabase/server";

export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
  sortOrder: number;
  hasReimbursableVariant: boolean;
  receiptTypeId: string;
};

export async function listFeeItems(receiptTypeId?: string): Promise<FeeItemRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("fee_items")
    .select(
      "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant, receipt_type_id",
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (receiptTypeId) {
    query = query.eq("receipt_type_id", receiptTypeId);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    hasReimbursableVariant: row.has_reimbursable_variant,
    receiptTypeId: row.receipt_type_id,
  }));
}
```

(The old name-only fallback is removed — `sort_order` and `receipt_type_id` are guaranteed by Tasks 1 & migration `20260527000000`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `fee-items.ts`. (Errors may appear in consumers not yet updated — those are fixed in later tasks; note them but proceed.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/fee-items.ts
git commit -m "feat(data): add receiptTypeId to FeeItemRow and listFeeItems filter"
```

---

## Task 4: Client queries — scope fee items and matrix to a receipt type

**Files:**
- Modify: `src/lib/queries/fee-rates.ts`
- Modify: `src/lib/data/fee-rates.ts`

- [ ] **Step 1: Update `fetchFeeItems` to require `receiptTypeId` and add it to the row mapping**

In `src/lib/queries/fee-rates.ts`, replace the `fetchFeeItems` function with:

```ts
export async function fetchFeeItems(receiptTypeId: string): Promise<FeeItemRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("fee_items")
    .select(
      "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant, receipt_type_id",
    )
    .eq("receipt_type_id", receiptTypeId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    hasReimbursableVariant: row.has_reimbursable_variant,
    receiptTypeId: row.receipt_type_id,
  }));
}
```

- [ ] **Step 2: Scope `fetchFeeRateMatrix` to a receipt type**

In the same file, change the signature and the `fee_items` query to filter by `receipt_type_id`:

```ts
export async function fetchFeeRateMatrix(
  semesterId: string,
  receiptTypeId: string,
): Promise<FeeRateMatrix> {
  const supabase = createClient();

  const [{ data: gradeData }, { data: itemData }, { data: rateData }] = await Promise.all([
    supabase
      .from("grade_levels")
      .select("id, name, sort_order")
      .eq("semester_id", semesterId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("fee_items")
      .select(
        "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant, receipt_type_id",
      )
      .eq("receipt_type_id", receiptTypeId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("fee_rates")
      .select("id, grade_level_id, fee_item_id, amount, amount_reimbursable")
      .eq("semester_id", semesterId),
  ]);
```

Leave the rest of `fetchFeeRateMatrix` (rate mapping, active-item filtering, return) unchanged.

- [ ] **Step 3: Scope the server-side `getFeeRateMatrix`**

In `src/lib/data/fee-rates.ts`, change the signature and pass the filter to `listFeeItems`:

```ts
export async function getFeeRateMatrix(
  semesterId: string,
  receiptTypeId: string,
): Promise<FeeRateMatrix> {
  const [grades, allItems, supabase] = await Promise.all([
    listGradeLevels(semesterId),
    listFeeItems(receiptTypeId),
    createClient(),
  ]);
```

Leave the remainder unchanged.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: the only remaining errors are in `fee-rates-page-panel.tsx` (deleted in Task 7) and callers updated in later tasks. Confirm `fee-rates.ts` and `queries/fee-rates.ts` themselves are clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/fee-rates.ts src/lib/data/fee-rates.ts
git commit -m "feat(query): scope fee items and rate matrix to receiptTypeId"
```

---

## Task 5: Action — `createFeeItem` requires `receiptTypeId`; revalidate receipt-types

**Files:**
- Modify: `src/lib/actions/fee-items.ts`

- [ ] **Step 1: Update revalidate paths**

Replace `revalidateFeePaths` with:

```ts
function revalidateFeePaths() {
  revalidatePath("/receipt-types");
  revalidatePath("/invoices");
}
```

- [ ] **Step 2: Add `receiptTypeId` to `createFeeItem`**

Replace `createFeeItem` with:

```ts
export async function createFeeItem(input: {
  name: string;
  description?: string;
  isTuition: boolean;
  hasReimbursableVariant: boolean;
  receiptTypeId: string;
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "กรุณาระบุชื่อรายการ" };
  if (!input.receiptTypeId) return { ok: false, error: "ไม่พบประเภทใบเสร็จ" };

  const supabase = await createClient();
  const { error } = await supabase.from("fee_items").insert({
    name,
    description: input.description?.trim() || null,
    is_tuition: input.isTuition,
    is_active: true,
    has_reimbursable_variant: input.hasReimbursableVariant,
    receipt_type_id: input.receiptTypeId,
  });

  if (error) return { ok: false, error: "ไม่สามารถเพิ่มรายการค่าใช้จ่ายได้" };

  revalidateFeePaths();
  return { ok: true };
}
```

`updateFeeItem`, `deleteFeeItems`, and `reorderFeeItems` are unchanged: `reorderFeeItems` already sets `sort_order = index` over exactly the IDs it is handed, so passing one type's ordered IDs scopes ordering to that type with no signature change.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `fee-items.ts` clean. `fee-items-section.tsx` will error on the missing `receiptTypeId` arg — fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/fee-items.ts
git commit -m "feat(action): createFeeItem requires receiptTypeId; revalidate receipt-types"
```

---

## Task 6: `FeeItemsSection` — accept and use `receiptTypeId`

**Files:**
- Modify: `src/components/finance/fee-items-section.tsx`

- [ ] **Step 1: Add `receiptTypeId` to props**

Change the props type and signature:

```tsx
type FeeItemsSectionProps = {
  items: FeeItemRow[];
  receiptTypeId: string;
};

export function FeeItemsSection({ items, receiptTypeId }: FeeItemsSectionProps) {
```

- [ ] **Step 2: Pass `receiptTypeId` when creating**

In `handleSubmit`, update the create call:

```tsx
    const result =
      mode === "create"
        ? await createFeeItem({ name, description, isTuition, hasReimbursableVariant, receiptTypeId })
        : await updateFeeItem(editTarget!.id, {
            name,
            description,
            isTuition,
            isActive,
            hasReimbursableVariant,
          });
```

- [ ] **Step 3: Make query invalidation type-scoped**

Replace `refreshLists` with:

```tsx
  function refreshLists() {
    queryClient.invalidateQueries({ queryKey: ["fee-items", receiptTypeId] });
    queryClient.invalidateQueries({ queryKey: ["fee-rate-matrix"] });
    router.refresh();
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: `fee-items-section.tsx` clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/fee-items-section.tsx
git commit -m "feat(ui): FeeItemsSection scoped to receiptTypeId"
```

---

## Task 7: Per-type fee-config pop-up + wire into receipt-types page; delete `/fee-rates`

**Files:**
- Create: `src/components/finance/receipt-type-fee-dialog.tsx`
- Modify: `src/components/finance/receipt-types-panel.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Delete: `src/app/(dashboard)/fee-rates/page.tsx`
- Delete: `src/components/finance/fee-rates-page-panel.tsx`

- [ ] **Step 1: Create the pop-up component**

Create `src/components/finance/receipt-type-fee-dialog.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchFeeItems, fetchFeeRateMatrix } from "@/lib/queries/fee-rates";
import { FeeItemsSection } from "@/components/finance/fee-items-section";
import { FeeRatesMatrix } from "@/components/finance/fee-rates-matrix";
import type { ReceiptTypeRow } from "@/lib/data/receipt-types";

type Props = {
  receiptType: ReceiptTypeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReceiptTypeFeeDialog({ receiptType, open, onOpenChange }: Props) {
  const { ctx, isLoading: ctxLoading } = useSemesterContext();
  const receiptTypeId = receiptType?.id ?? null;

  const { data: feeItems = [] } = useQuery({
    queryKey: ["fee-items", receiptTypeId],
    queryFn: () => fetchFeeItems(receiptTypeId!),
    enabled: open && Boolean(receiptTypeId),
    staleTime: 60_000,
  });

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ["fee-rate-matrix", ctx?.semesterId, receiptTypeId],
    queryFn: () => fetchFeeRateMatrix(ctx!.semesterId, receiptTypeId!),
    enabled: open && Boolean(ctx?.semesterId) && Boolean(receiptTypeId),
    staleTime: 30_000,
  });

  const isLoading = ctxLoading || matrixLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>ตั้งค่าค่าธรรมเนียม — {receiptType?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {!ctx && !ctxLoading ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
          ) : isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : ctx && matrix && receiptTypeId ? (
            <>
              <FeeItemsSection items={feeItems} receiptTypeId={receiptTypeId} />
              <FeeRatesMatrix semesterId={ctx.semesterId} matrix={matrix} />
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the launch button + state to the receipt-types panel**

In `src/components/finance/receipt-types-panel.tsx`:

Add imports near the existing ones:

```tsx
import { SlidersHorizontal } from "lucide-react";
import { ReceiptTypeFeeDialog } from "@/components/finance/receipt-type-fee-dialog";
```

Add state next to the other `useState` hooks in `ReceiptTypesPanel`:

```tsx
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [feeTarget, setFeeTarget] = useState<ReceiptTypeRow | null>(null);

  function openFeeConfig(row: ReceiptTypeRow) {
    setFeeTarget(row);
    setFeeDialogOpen(true);
  }
```

In the row actions cell, add a button before the existing "แก้ไข" button:

```tsx
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => openFeeConfig(row)}>
                      <SlidersHorizontal className="mr-1 h-4 w-4" />
                      ตั้งค่าค่าธรรมเนียม
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                      <Pencil className="mr-1 h-4 w-4" />
                      แก้ไข
                    </Button>
                  </div>
                </TableCell>
```

Render the dialog just before the closing `</Card>` (next to the existing edit `<Dialog>`):

```tsx
      <ReceiptTypeFeeDialog
        receiptType={feeTarget}
        open={feeDialogOpen}
        onOpenChange={setFeeDialogOpen}
      />
```

- [ ] **Step 3: Remove the `/fee-rates` nav entry**

In `src/components/app-sidebar.tsx`, delete this line from `financeNav`:

```tsx
  { href: "/fee-rates", label: "ตั้งค่าค่าธรรมเนียม", icon: SlidersHorizontal },
```

If `SlidersHorizontal` is now unused in that file, remove it from the lucide import to keep lint clean.

- [ ] **Step 4: Delete the old page + panel**

```bash
git rm "src/app/(dashboard)/fee-rates/page.tsx" src/components/finance/fee-rates-page-panel.tsx
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (No references to `fee-rates-page-panel`, `FeeRatesPagePanel`, or `/fee-rates` remain.)

- [ ] **Step 6: Manual preview verification**

Run the dev server (preview_start), open `/receipt-types`, click "ตั้งค่าค่าธรรมเนียม" on a row. Confirm the pop-up shows the fee-item list (drag works, add/edit/delete works) and the grade rate matrix, both scoped to that type. Confirm the old "ตั้งค่าค่าธรรมเนียม" sidebar item is gone and `/fee-rates` 404s. Capture a screenshot.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): per-receipt-type fee config pop-up; remove /fee-rates page"
```

---

## Task 8: Invoice data — carry `receiptTypeId` on `InvoiceListRow`

**Files:**
- Modify: `src/lib/data/invoices.ts`

- [ ] **Step 1: Add the field to the type**

In `InvoiceListRow`, add after `isReimbursable`:

```ts
  receiptTypeId: string;
```

- [ ] **Step 2: Select and map it in `listInvoicesPaginated`**

Add `receipt_type_id` to the `.select(...)` column list (after `is_reimbursable`), add `receipt_type_id: string;` to the local `Row` type, and add to the mapped row object:

```ts
      receiptTypeId: row.receipt_type_id,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `invoices.ts` clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/invoices.ts
git commit -m "feat(data): expose receiptTypeId on InvoiceListRow"
```

---

## Task 9: Invoice generation — select receipt type and stamp it

**Files:**
- Modify: `src/lib/actions/invoices.ts`
- Modify: `src/components/finance/invoice-generate-dialog.tsx`

- [ ] **Step 0: Add an all-types client query and use it in the invoices panel**

`invoices-panel.tsx:121` currently calls `fetchFeeItems` with no argument; Task 4 made `fetchFeeItems(receiptTypeId)` required. The generate dialog needs the full item set (all types) so it can filter client-side. Add a no-filter client query to `src/lib/queries/fee-rates.ts`:

```ts
export async function fetchAllFeeItems(): Promise<FeeItemRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("fee_items")
    .select(
      "id, name, description, is_tuition, is_active, sort_order, has_reimbursable_variant, receipt_type_id",
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    hasReimbursableVariant: row.has_reimbursable_variant,
    receiptTypeId: row.receipt_type_id,
  }));
}
```

In `src/components/finance/invoices-panel.tsx`, change the import and the query:

```tsx
import { fetchAllFeeItems } from "@/lib/queries/fee-rates";
```

```tsx
  const { data: feeItems = [] } = useQuery({
    queryKey: ["fee-items", "all"],
    queryFn: fetchAllFeeItems,
  });
```

- [ ] **Step 1: Add `receiptTypeId` to the action input and invoice rows**

In `src/lib/actions/invoices.ts`, add to `GenerateInput`:

```ts
  receiptTypeId: string;
```

Add a guard near the top of `generateInvoices` (after the `feeItemIds.length` check):

```ts
  if (!input.receiptTypeId) {
    return { ok: false, error: "กรุณาเลือกประเภทใบเสร็จ" };
  }
```

Add `receipt_type_id: string;` to the `InvoiceRow` type, and set it when pushing each invoice row:

```ts
    invoiceRows.push({
      id: invoiceId,
      student_id: enrollment.studentId,
      academic_year_id: input.academicYearId,
      semester_id: input.semesterId,
      invoice_name: invoiceName,
      receipt_type_id: input.receiptTypeId,
      subtotal,
      total_amount: totalAmount,
      paid_amount: 0,
      status: "unpaid",
      is_reimbursable: isReimbursable,
    });
```

- [ ] **Step 2: Add a receipt-type selector to the generate dialog and filter items**

In `src/components/finance/invoice-generate-dialog.tsx`:

Add imports:

```tsx
import { useQuery } from "@tanstack/react-query";
import { fetchReceiptTypes } from "@/lib/queries/receipt-types";
```

Add state + data near the top of the component:

```tsx
  const { data: receiptTypes = [] } = useQuery({
    queryKey: ["receipt-types"],
    queryFn: fetchReceiptTypes,
  });
  const [receiptTypeId, setReceiptTypeId] = useState<string>("");
```

Reset it when the dialog opens (inside the existing `useEffect` that runs on `open`):

```tsx
    setReceiptTypeId("");
```

Derive the type-scoped item list and use it everywhere `activeItems` was used:

```tsx
  const activeItems = feeItems.filter(
    (i) => i.isActive && (!receiptTypeId || i.receiptTypeId === receiptTypeId),
  );
```

Reset the fee-item selection whenever the chosen type changes so stale IDs from another type cannot leak through:

```tsx
  useEffect(() => {
    setSelectedFeeItemIds(new Set(activeItems.map((i) => i.id)));
  }, [receiptTypeId]); // eslint-disable-line react-hooks/exhaustive-deps
```

Render a selector at the top of the LEFT column, above the "Mode" block:

```tsx
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">ประเภทใบเสร็จ</Label>
                <select
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  value={receiptTypeId}
                  onChange={(e) => setReceiptTypeId(e.target.value)}
                >
                  <option value="">— เลือกประเภท —</option>
                  {receiptTypes
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>
```

In `handleRequestSubmit`, add a guard before the fee-item check:

```tsx
    if (!receiptTypeId) {
      toast.error("กรุณาเลือกประเภทใบเสร็จ");
      return;
    }
```

In `handleConfirmedSubmit`, pass `receiptTypeId` to `generateInvoices`:

```tsx
    const result = await generateInvoices({
      semesterId,
      academicYearId,
      academicYearName,
      semesterNumber,
      receiptTypeId,
      feeItemIds,
      studentIds,
      reimbursableStudentIds: [...reimbursableStudentIds],
    });
```

Disable the submit button until a type is chosen — update its `disabled`:

```tsx
                disabled={submitting || targetCount === 0 || selectedFeeItemIds.size === 0 || !receiptTypeId}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Step 0 already switched `invoices-panel.tsx` to `fetchAllFeeItems`, so the dialog receives all items with `receiptTypeId` and filters client-side.

- [ ] **Step 4: Manual preview verification**

Open `/invoices`, launch "สร้างใบแจ้งชำระ". Confirm: a receipt-type selector appears; choosing a type filters the fee-item list to that type; generating requires a type; generated invoices carry the chosen `receipt_type_id` (check in Studio). Screenshot.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(invoice): choose receipt type on generation and stamp it on invoices"
```

---

## Task 10: Single-invoice allocation helper (pure logic, TDD)

**Files:**
- Create: `src/lib/finance/single-invoice-allocation.ts`
- Test: `src/lib/finance/single-invoice-allocation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { resolveSingleInvoicePayment } from "./single-invoice-allocation";

describe("resolveSingleInvoicePayment", () => {
  it("returns the requested amount when within outstanding", () => {
    expect(resolveSingleInvoicePayment({ amount: 500, outstanding: 1000 })).toEqual({
      ok: true,
      amount: 500,
    });
  });

  it("allows paying the full outstanding", () => {
    expect(resolveSingleInvoicePayment({ amount: 1000, outstanding: 1000 })).toEqual({
      ok: true,
      amount: 1000,
    });
  });

  it("rejects zero or negative amounts", () => {
    expect(resolveSingleInvoicePayment({ amount: 0, outstanding: 1000 }).ok).toBe(false);
    expect(resolveSingleInvoicePayment({ amount: -5, outstanding: 1000 }).ok).toBe(false);
  });

  it("rejects amounts exceeding outstanding", () => {
    expect(resolveSingleInvoicePayment({ amount: 1200, outstanding: 1000 }).ok).toBe(false);
  });

  it("rejects when nothing is outstanding", () => {
    expect(resolveSingleInvoicePayment({ amount: 100, outstanding: 0 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- single-invoice-allocation`
Expected: FAIL — `resolveSingleInvoicePayment` is not defined.

- [ ] **Step 3: Implement the helper**

```ts
export type SingleInvoicePaymentInput = {
  amount: number;
  outstanding: number;
};

export type SingleInvoicePaymentResult =
  | { ok: true; amount: number }
  | { ok: false; error: string };

export function resolveSingleInvoicePayment(
  input: SingleInvoicePaymentInput,
): SingleInvoicePaymentResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "จำนวนเงินต้องมากกว่า 0" };
  }
  if (input.outstanding <= 0) {
    return { ok: false, error: "ใบแจ้งนี้ไม่มียอดค้างชำระ" };
  }
  if (input.amount > input.outstanding) {
    return { ok: false, error: "จำนวนเงินเกินยอดค้างของใบแจ้งนี้" };
  }
  return { ok: true, amount: input.amount };
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- single-invoice-allocation`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/single-invoice-allocation.ts src/lib/finance/single-invoice-allocation.test.ts
git commit -m "feat(finance): single-invoice payment resolver with tests"
```

---

## Task 11: `recordPayment` — pay one invoice, inherit its receipt type

**Files:**
- Modify: `src/lib/actions/payments.ts`

- [ ] **Step 1: Change `recordPayment` input to invoice-based**

Replace the `RecordPaymentInput` type:

```ts
type RecordPaymentInput = {
  invoiceId: string;
  studentId: string;
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  amount: number;
  paymentMethod: "cash" | "transfer";
  transferReference?: string;
  note?: string;
};
```

- [ ] **Step 2: Replace FIFO with single-invoice allocation + receipt type from the invoice**

Replace the body from the start of `recordPayment` down to (and including) the `allocations` construction with logic that loads the one invoice, validates with the pure helper, and reads its `receipt_type_id`:

```ts
export async function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("student_invoices")
    .select("id, invoice_name, total_amount, paid_amount, receipt_type_id, student_id")
    .eq("id", input.invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "ไม่พบใบแจ้งชำระ" };
  if (invoice.student_id !== input.studentId) {
    return { ok: false, error: "ใบแจ้งชำระไม่ตรงกับนักเรียน" };
  }

  const outstanding = Math.max(
    0,
    Math.round((Number(invoice.total_amount) - Number(invoice.paid_amount)) * 100) / 100,
  );

  const resolved = resolveSingleInvoicePayment({ amount: input.amount, outstanding });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const receiptTypeId = invoice.receipt_type_id;
  if (!receiptTypeId) return { ok: false, error: "ใบแจ้งชำระไม่มีประเภทใบเสร็จ" };

  const allocations = [{ invoiceId: invoice.id, amount: resolved.amount }];
```

Add the import at the top of the file:

```ts
import { resolveSingleInvoicePayment } from "@/lib/finance/single-invoice-allocation";
```

Remove the now-unused imports `allocatePaymentFifo` and `getStudentOutstandingInvoices` if nothing else in the file uses them (check first — `getStudentOutstandingAction` may still use the latter; keep what is used).

- [ ] **Step 3: Update the receipt-number / student fetch block and snapshot**

The existing block fetches `existingReceipts`, `getDefaultReceiptTypeId()`, and `student`. Remove `getDefaultReceiptTypeId()` from that `Promise.all` (we now use the invoice's type) and drop the `if (!receiptTypeId) return ...` line that referenced the default lookup. Build `allocationDetails` from the single allocation:

```ts
  const allocationDetails = allocations.map((a) => ({
    invoiceId: a.invoiceId,
    invoiceName: invoice.invoice_name,
    amount: a.amount,
  }));
```

Everything downstream (`paidTotal`, `snapshot`, `payments` insert, `payment_allocations` insert, `receipts` insert with `receipt_type_id: receiptTypeId`, the per-invoice status update loop) stays as-is — it already iterates `allocations`, which now has exactly one entry. Confirm the `receipts` insert still reads `receipt_type_id: receiptTypeId`.

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean except `invoice-payment-dialog.tsx` (Task 12). All existing unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat(payment): record payment per invoice; receipt inherits invoice receipt type"
```

---

## Task 12: `InvoicePaymentDialog` — pay only the clicked invoice

**Files:**
- Modify: `src/components/finance/invoice-payment-dialog.tsx`

- [ ] **Step 1: Drive amount/limits from the single invoice, not student-wide outstanding**

Replace the `useEffect` that loads `getStudentOutstandingAction` with one that uses the invoice's own outstanding (the `invoice` prop is `InvoiceListRow`, which has `outstanding`):

```tsx
  useEffect(() => {
    if (!open || !invoice) return;
    setMethod("cash");
    setTransferRef("");
    setNote("");
    setAmount(invoice.outstanding > 0 ? String(invoice.outstanding) : "");
  }, [open, invoice]);
```

Remove the `outstanding` state, the `getStudentOutstandingAction` import, the `loading` state, and the `OutstandingInvoiceRow` import/usage. Replace `totalDue` references with `invoice.outstanding`.

- [ ] **Step 2: Show a single-invoice summary**

Replace the outstanding-list block in the JSX with a summary of just this invoice:

```tsx
              {!invoice ? null : (
                <div className="rounded-md border text-sm">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="font-medium truncate max-w-[220px]">{invoice.invoiceName}</span>
                    <span className="tabular-nums font-medium">{formatBaht(invoice.outstanding)}</span>
                  </div>
                </div>
              )}
```

Update the amount input's `max` to `invoice?.outstanding` and the validation in `handleSubmit`:

```tsx
    const outstanding = invoice?.outstanding ?? 0;
    if (parsed > outstanding) {
      toast.error(`จำนวนเงินเกินยอดค้าง (${formatBaht(outstanding)})`);
      return;
    }
```

- [ ] **Step 3: Pass `invoiceId` to `recordPayment`**

In `handleConfirm`:

```tsx
    const result = await recordPayment({
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      academicYearId: ctx.academicYearId,
      academicYearName: ctx.academicYearName,
      semesterId: ctx.semesterId,
      amount: parsed,
      paymentMethod: method,
      transferReference: method === "transfer" ? transferRef.trim() : undefined,
      note: note.trim() || undefined,
    });
```

Update the submit button's `disabled` to drop the removed `loading`/`outstanding.length` conditions:

```tsx
              <Button type="submit" disabled={submitting || !invoice || invoice.outstanding <= 0}>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Remove any now-unused imports flagged by lint.

- [ ] **Step 5: Manual preview verification**

Open `/invoices`, click pay on an invoice. Confirm only that invoice's outstanding shows, the amount caps at it, paying issues one receipt, and the printed receipt's type matches the invoice's receipt type. For an invoice generated under a non-`"01"` type, confirm the receipt shows that type. Screenshot.

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/invoice-payment-dialog.tsx
git commit -m "feat(payment): pay a single invoice per receipt"
```

---

## Task 13: CSV backfill import — derive receipt type from invoice

**Files:**
- Modify: `src/lib/actions/payments.ts` (the second/backfill block, around the `importPaymentsBackfill`/CSV path)

- [ ] **Step 1: Inspect the backfill path**

Read the second block in `src/lib/actions/payments.ts` that calls `getDefaultReceiptTypeId()` (near the `payments.select("receipt_number").eq("academic_year_id", ...)` and `getStudentGradeMap` `Promise.all`). Identify where each receipt row is inserted and which invoice(s) each backfilled payment maps to.

- [ ] **Step 2: Use the mapped invoice's `receipt_type_id`, fall back to default**

When the backfill resolves the invoice for a row, select its `receipt_type_id` alongside the other invoice fields, and use it for the `receipts.receipt_type_id` insert. Keep `getDefaultReceiptTypeId()` only as the fallback when no invoice is matched:

```ts
    const receiptTypeId = matchedInvoice?.receipt_type_id ?? defaultReceiptTypeId;
```

(Where `defaultReceiptTypeId` is the existing `getDefaultReceiptTypeId()` result, retained for unmatched historical rows. Add `receipt_type_id` to whatever invoice select the backfill already performs.)

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean; all unit tests pass.

- [ ] **Step 4: Manual preview verification**

Run a CSV backfill import (use the existing import dialog with a sample CSV). Confirm imported receipts whose invoices are non-`"01"` carry the invoice's type, and unmatched rows fall back to `"01"`. Screenshot or Studio check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat(import): backfilled receipts derive receipt type from invoice"
```

---

## Task 14: Full verification sweep

- [ ] **Step 1: Typecheck, lint, unit tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean; all tests pass.

- [ ] **Step 2: End-to-end manual pass (preview)**

Walk the full flow and screenshot each:
1. `/receipt-types` → create a second receipt type (e.g. "ค่าหอพัก").
2. Open its fee-config pop-up → add fee items (drag-reorder) and set grade rates.
3. `/invoices` → generate invoices choosing that type → items list is filtered to that type.
4. Pay one generated invoice → one receipt issued carrying that receipt type.
5. Confirm `/fee-rates` is gone from the sidebar and 404s.

- [ ] **Step 3: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: receipt-type fee config verification cleanup"
```

---

## Self-Review Notes (author checklist, already applied)

- **Spec coverage:** A→Task 1/2 (migrations) + Task 7 (pop-up, delete page, nav). B→Tasks 1–6. C→Tasks 8–9. D→Tasks 10–13. All spec sections map to tasks.
- **`invoices-panel.tsx` fee-item feed:** resolved concretely in Task 9 Step 0 — a new `fetchAllFeeItems()` query replaces the now-invalid no-arg `fetchFeeItems()` call so the generate dialog gets all items (with `receiptTypeId`) for client-side filtering.
- **Type consistency:** `receiptTypeId` (camelCase) on TS types, `receipt_type_id` (snake_case) in SQL/Supabase selects throughout. `resolveSingleInvoicePayment` signature matches between Task 10 and its use in Task 11.
- **Reorder scoping:** no signature change — `reorderFeeItems` operates on the IDs handed to it, which are per-type because the matrix/list are now per-type.
