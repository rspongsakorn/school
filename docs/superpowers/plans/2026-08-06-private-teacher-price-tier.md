# Third price tier — "เอกชน" — Implementation Plan

**Goal:** Replace the two-state `is_reimbursable` boolean with a three-state
`price_tier` (`standard` | `reimbursable` | `private`) across DB, price selection,
UI, filters, and CSV/XLSX import, without changing any already-issued invoice.

**Spec:** `docs/superpowers/specs/2026-08-06-private-teacher-price-tier-design.md`

**Tech Stack:** Next.js App Router (server actions + server components), Supabase
(Postgres), React + TanStack Query, Tailwind, Vitest.

---

## File Structure

- **Create** `supabase/migrations/20260806010000_price_tier.sql`
- **Create** `src/lib/finance/price-tier.ts` — the `PriceTier` type + label/parse helpers
- **Create** `src/lib/finance/price-tier.test.ts`
- **Modify** `src/lib/finance/pick-fee-amount.ts` + `.test.ts`
- **Modify** `src/lib/finance/reimbursable-selection.ts` + `.test.ts` → tier map
- **Modify** `src/lib/finance/fee-item-edit-eligibility.ts` (no field change; verify)
- **Modify** `src/lib/supabase/types.ts`
- **Modify** `src/lib/data/fee-rates.ts`, `src/lib/queries/fee-rates.ts`, `src/lib/actions/fee-rates.ts`
- **Modify** `src/components/finance/fee-rates-matrix.tsx`
- **Modify** `src/lib/students/validation.ts` (+ test), `src/lib/actions/students.ts`,
  `src/lib/data/students.ts`, `src/lib/queries/students.ts`
- **Modify** `src/components/students/student-sheet.tsx`, `students-panel.tsx`
- **Modify** `src/lib/students/csv-import.ts` (+ test), `csv-format.ts`
- **Modify** `src/lib/actions/invoices.ts`, `src/lib/data/invoices.ts`, `src/lib/queries/invoices.ts`
- **Modify** `src/components/finance/invoice-generate-dialog.tsx`,
  `invoice-reimbursable-dialog.tsx`, `invoices-panel.tsx`
- **Modify** `src/lib/data/reports.ts`, `src/lib/queries/reports.ts`,
  `src/components/finance/outstanding-report-panel.tsx`
- **Modify** `src/lib/actions/payments.ts`, `src/lib/finance/xlsx-import.ts` (+ test),
  `src/lib/finance/xlsx-format.ts`

---

## Task 1: Migration + generated types

- [x] Write `supabase/migrations/20260806010000_price_tier.sql` exactly as in the spec
      (add `fee_rates.amount_private`; convert `students` / `student_invoices`
      booleans to `price_tier` with backfill; widen `invoice_lines.variant` CHECK).
- [x] Update `src/lib/supabase/types.ts`: `students.price_tier`,
      `student_invoices.price_tier`, `fee_rates.amount_private`,
      `invoice_lines.variant` adds `"private"`.
- [ ] Verify: `npm run db:push` (or note it for the operator if the stack is down).

## Task 2: Price tier helpers (TDD)

- [x] `price-tier.test.ts` first: `parsePriceTier` accepts `standard`/`reimbursable`/
      `private` and rejects anything else; `priceTierLabel` returns
      `เบิกไม่ได้`/`เบิกได้`/`เอกชน`; `parsePriceTierLabel` accepts those three Thai
      words **and** an empty string (→ `standard`), rejects the rest.
- [x] Implement `src/lib/finance/price-tier.ts`.
- [x] `npm run test`

## Task 3: pickFeeAmount (TDD)

- [x] Rewrite `pick-fee-amount.test.ts` to the decision table in the spec (6 rows,
      including `private` → null → `standard` fallback).
- [x] Rewrite `pick-fee-amount.ts` to take `{ tier, hasReimbursableVariant, amount,
      amountReimbursable, amountPrivate }`.
- [x] `npm run test`

## Task 4: Fee-rate matrix (3rd price input)

- [x] `data/fee-rates.ts`: `FeeRateMatrixCell.amountPrivate`.
- [x] `queries/fee-rates.ts`: select + map `amount_private`.
- [x] `actions/fee-rates.ts`: `FeeRateUpsertEntry.amountPrivate`, non-negative
      validation, write the column.
- [x] `fee-rates-matrix.tsx`: `DraftCell.amountPrivate`, third input row labelled
      `เอกชน` with placeholder `(ว่าง = ใช้ราคาปกติ)`, badge `2 ราคา` → `3 ราคา`,
      include the field in `changedEntries` diffing.

## Task 5: Student tier

- [x] `validation.ts` + test: `priceTier` replaces `isReimbursable`.
- [x] `actions/students.ts`, `data/students.ts`, `queries/students.ts`: rename to
      `price_tier` / `priceTier`.
- [x] `student-sheet.tsx`: switch → 3-option segmented control (การเบิก).
- [x] `students-panel.tsx`: badge shows `เบิกได้` or `เอกชน` (none for standard).

## Task 6: CSV / XLSX import + export

- [x] `csv-import.test.ts` first: legacy `เบิกได้`/`เบิกไม่ได้` still work, `เอกชน`
      maps to `private`, empty → `standard`, junk → error.
- [x] `csv-import.ts`: `mapReimbursableLabel` → `mapPriceTierLabel` (delegates to
      `price-tier.ts`), row type, error message, export label.
- [x] `csv-format.ts`: header/sample wording if it mentions the two labels.
- [x] `xlsx-import.ts` / `xlsx-format.ts`: same rename where referenced.

## Task 7: Invoice generation + tier change

- [x] `reimbursable-selection.ts` → returns `Map<studentId, PriceTier>` seeded from
      each candidate's `priceTier`; update its test.
- [x] `actions/invoices.ts` generate path: accept per-student tier, pass to
      `pickFeeAmount`, write `student_invoices.price_tier`.
- [x] `actions/invoices.ts` `updateInvoiceReimbursable` → `updateInvoicePriceTier`,
      takes a tier; keep the `paid_amount > 0` guard; select `amount_private`.
- [x] `data/invoices.ts` / `queries/invoices.ts`: rename fields, filter by
      `price_tier`, candidate `defaultPriceTier`.
- [x] `invoice-generate-dialog.tsx`: per-row 3-way control, "ตั้งทั้งหมดเป็น →",
      per-tier counts.
- [x] `invoice-reimbursable-dialog.tsx`: choose-new-tier instead of flip.
- [x] `invoices-panel.tsx`: filter option `เอกชน`, badge label per tier.

## Task 8: Reports + payments

- [x] `data/reports.ts`, `queries/reports.ts`: `.eq("price_tier", tier)`, param type
      gains `"private"`.
- [x] `outstanding-report-panel.tsx`: filter option `เอกชน`, label per tier.
- [x] `actions/payments.ts`: rename the selected field / display usage.

## Task 9: Verify

- [x] `npm run test`
- [x] `npx tsc --noEmit`
- [x] `npm run lint`
- [x] `npm run build`
- [ ] Commit.
