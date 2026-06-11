# Rename `receipt_type` → `invoice_type` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the database table `receipt_types` → `invoice_types` and the FK column `receipt_type_id` → `invoice_type_id` everywhere, with a fully consistent code rename (identifiers, route, filenames).

**Architecture:** One additive migration does the DB rename (`ALTER ... RENAME`, non-destructive). All code is renamed via case-aware token replacement across four token forms, plus file/route renames. The `receipts` table and receipt-printing concept (the actual printed receipt) are SEPARATE and must NOT be renamed.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase/PostgREST, Vitest

---

## Critical scoping rule

Rename ONLY the "receipt type" concept. Do NOT touch:
- `receipts` table, `receipt_number`, `receipt-print.ts`, `receipt-dialog.tsx`, the `Receipt` icon import — these are the real printed receipt.
- Historical migration files `20260611000000_*`, `20260611000100_*`, `20260524120000_initial_schema.sql`, `20260611000200_*` — they describe past state; the rename migration handles the transition. Leave them as-is.

The four token forms to replace (case-sensitive), each is safe because the receipt-printing tokens above never contain `receipt_type` / `receiptType` / `ReceiptType` / `receipt-type` as a substring:
1. snake: `receipt_type` → `invoice_type` (covers `receipt_type`, `receipt_types`, `receipt_type_id`)
2. camel: `receiptType` → `invoiceType` (covers `receiptType`, `receiptTypeId`, `receiptTypes`)
3. Pascal: `ReceiptType` → `InvoiceType` (covers `ReceiptType`, `ReceiptTypeRow`, `ReceiptTypeFeeDialog`, etc.)
4. kebab: `receipt-type` → `invoice-type` (covers `receipt-types`, `receipt-type-fee-dialog`, import paths, the `/receipt-types` href)

---

### Task 1: DB rename migration

**Files:**
- Create: `supabase/migrations/20260611000300_rename_receipt_types_to_invoice_types.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Rename the "receipt type" concept to "invoice type" across the schema.
-- All operations are metadata renames (non-destructive).

ALTER TABLE public.receipt_types RENAME TO invoice_types;

ALTER TABLE public.student_invoices RENAME COLUMN receipt_type_id TO invoice_type_id;
ALTER TABLE public.fee_items        RENAME COLUMN receipt_type_id TO invoice_type_id;
ALTER TABLE public.fee_rates        RENAME COLUMN receipt_type_id TO invoice_type_id;
ALTER TABLE public.receipts         RENAME COLUMN receipt_type_id TO invoice_type_id;

ALTER INDEX IF EXISTS idx_fee_items_receipt_type_id
  RENAME TO idx_fee_items_invoice_type_id;
ALTER INDEX IF EXISTS idx_student_invoices_receipt_type_id
  RENAME TO idx_student_invoices_invoice_type_id;

ALTER TABLE public.invoice_types
  RENAME CONSTRAINT receipt_types_code_unique TO invoice_types_code_unique;

ALTER TRIGGER receipt_types_set_updated_at ON public.invoice_types
  RENAME TO invoice_types_set_updated_at;

ALTER POLICY receipt_types_select ON public.invoice_types
  RENAME TO invoice_types_select;
ALTER POLICY receipt_types_admin_write ON public.invoice_types
  RENAME TO invoice_types_admin_write;
```

Note: `receipts.invoice_type_id` is the receipt's link to the invoice type — that column IS part of the rename (it is a `receipt_type_id` FK), even though the `receipts` table name stays.

- [ ] **Step 2: Commit** (after code tasks; or commit migration separately)

---

### Task 2: Seed + setup script

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `scripts/setup-database.mjs`

- [ ] **Step 1: `supabase/seed.sql`**

Replace token `receipt_types` → `invoice_types` (line ~1 comment and the `INSERT INTO public.receipt_types ...`).

- [ ] **Step 2: `scripts/setup-database.mjs`**

Replace `receipt_types` → `invoice_types` in the verification query (`SELECT code, name FROM public.receipt_types ...`) and the log label.

---

### Task 3: Code-wide token rename

**Files (all under `src/`, 16 files — apply the four token replacements):**
- `src/lib/supabase/types.ts`
- `src/lib/queries/receipt-types.ts`, `src/lib/queries/invoices.ts`, `src/lib/queries/fee-rates.ts`
- `src/lib/data/receipt-types.ts`, `src/lib/data/invoices.ts`, `src/lib/data/fee-items.ts`, `src/lib/data/receipt-print.ts`
- `src/lib/actions/receipt-types.ts`, `src/lib/actions/invoices.ts`, `src/lib/actions/payments.ts`, `src/lib/actions/fee-rates.ts`, `src/lib/actions/fee-items.ts`
- `src/components/finance/receipt-types-panel.tsx`, `src/components/finance/receipt-type-fee-dialog.tsx`, `src/components/finance/invoice-generate-dialog.tsx`, `src/components/finance/fee-items-section.tsx`
- `src/app/(dashboard)/receipt-types/page.tsx`
- `src/components/app-sidebar.tsx`

- [ ] **Step 1: Apply the four token replacements in every file that contains them**

Use case-sensitive replace for each form (snake, camel, Pascal, kebab). This updates DB refs in select strings (`.from("receipt_types")` → `.from("invoice_types")`, embeds `receipt_types ( name )` → `invoice_types ( name )`, column `receipt_type_id` → `invoice_type_id`), TS types/vars/props, import paths, and the `/receipt-types` href.

`src/lib/data/receipt-print.ts` only contains the embed/relationship to the invoice type — apply token replacement there too (it has `receipt_type` tokens but NOT for the printed-receipt concept; verify each hit is the type concept before replacing). Do NOT rename `receiptNumber`, `receipt_number`, the `receipts` table, or `ReceiptPrintData`.

---

### Task 4: Rename files + route folder (git mv)

- [ ] **Step 1: Rename files**

```
git mv src/lib/data/receipt-types.ts src/lib/data/invoice-types.ts
git mv src/lib/queries/receipt-types.ts src/lib/queries/invoice-types.ts
git mv src/lib/actions/receipt-types.ts src/lib/actions/invoice-types.ts
git mv src/components/finance/receipt-types-panel.tsx src/components/finance/invoice-types-panel.tsx
git mv src/components/finance/receipt-type-fee-dialog.tsx src/components/finance/invoice-type-fee-dialog.tsx
git mv "src/app/(dashboard)/receipt-types" "src/app/(dashboard)/invoice-types"
```

- [ ] **Step 2: Confirm import paths already updated**

Task 3's kebab replacement should have updated all `@/lib/.../receipt-types`, `@/components/finance/receipt-types-panel`, `@/components/finance/receipt-type-fee-dialog` imports to the new names. Verify with grep.

---

### Task 5: Verification gate

- [ ] **Step 1: No stale tokens remain in code**

Run: `git grep -nE "receipt[_-]?type|ReceiptType" -- "src/" "supabase/seed.sql" "scripts/setup-database.mjs"`
Expected: no results. (Historical migrations under `supabase/migrations/` legitimately still contain `receipt_type` — exclude them.)

- [ ] **Step 2: Type check / lint / build**

Run: `npx tsc --noEmit` → no errors
Run: `npm run lint` → no new errors
Run: `npm run build` → exit 0

- [ ] **Step 3: Commit**

```bash
git add src/ supabase/ scripts/setup-database.mjs
git commit -m "refactor: rename receipt_type to invoice_type (table, column, code, route)"
```

---

### Task 6: Apply migration to local DB (requires Docker)

> Docker Desktop must be running first. If it is not up, this task is deferred and the user applies it.

- [ ] **Step 1: Start local stack**

Run: `npm run db:start`

- [ ] **Step 2: Apply migrations + seed**

Run: `npm run db:reset`
Expected: all migrations replay (initial → ... → 20260611000300 rename), seed inserts into `invoice_types`, no errors.

- [ ] **Step 3: Smoke check**

Run: `npm run db:setup` (or query) to confirm `invoice_types` has rows.

---

## Manual verification (after execute)

- App builds and `/invoices`, `/payments`, `/invoice-types` (renamed route) load.
- Generating an invoice, recording a payment, and printing a receipt still work (PostgREST embeds resolve against `invoice_types`).
