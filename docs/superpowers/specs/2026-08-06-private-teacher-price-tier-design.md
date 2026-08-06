# Third price tier — "เอกชน" (private-school teacher reimbursable) — design

Date: 2026-08-06

## Problem

Fee pricing currently supports exactly **two** prices, modelled as booleans end to
end: `students.is_reimbursable`, `student_invoices.is_reimbursable`,
`fee_rates.amount` + `fee_rates.amount_reimbursable`, and
`invoice_lines.variant IN ('standard','reimbursable')`.

A third real-world case exists: **ครูเอกชนเบิกได้** — private-school teachers who
can claim reimbursement, but at a rate different from both the normal price and the
government (ราชการ) reimbursable price. A boolean cannot express three states, and
adding a second boolean would allow the meaningless combination "both true".

## Goal

Replace the two-state boolean with a **three-state price tier** so the operator can
mark a student / an invoice as one of: normal, government-reimbursable, or
private-teacher-reimbursable, and have the correct ค่าเทอม price applied.

## Decisions (agreed with user)

- **Exactly three tiers, closed set.** There is no anticipated fourth case, so this
  is a plain `text` + `CHECK` enum — **no lookup table, no per-tier amounts table.**
  Tier codes: `'standard'`, `'reimbursable'`, `'private'`.
- **Display / CSV wording:** `เบิกไม่ได้`, `เบิกได้`, `เอกชน`.
- **Blank "เอกชน" price falls back to the normal price** (`fee_rates.amount`), i.e.
  the same rule already used for a blank `amount_reimbursable`. It does *not*
  cascade to the reimbursable price — the fallback must be predictable from what is
  visible on screen.
- **Per-item opt-in is unchanged.** `fee_items.has_reimbursable_variant` keeps its
  current meaning ("this item has tiered pricing") and is not renamed. In practice
  only ค่าเทอม has it ticked.
- **Existing data is not repriced.** The migration maps status values only.

## Non-goals (YAGNI)

- No lookup/config table for tiers, no admin UI to add a fourth tier.
- No recalculation of already-issued invoices, receipts, or payment records.
- No change to discounts, receipt numbering, or payment allocation.

## Impact on existing data — none

Verified in code:

- `pickFeeAmount` has exactly two call sites, both explicit operator actions:
  `src/lib/actions/invoices.ts:202` (generate invoices) and `:421`
  (`updateInvoiceReimbursable`). Nothing recomputes an amount on read.
- `updateInvoiceReimbursable` already refuses to run when `paid_amount > 0`
  (`src/lib/actions/invoices.ts:359`), so paid/partially-paid invoices are frozen.
- All display paths read the stored `invoice_lines.amount` /
  `student_invoices.total_amount` snapshots.
- `payments` / `payment_allocations` carry no tier column at all.

Therefore the migration is a **status rename only**: `false → 'standard'`,
`true → 'reimbursable'`. No amount column is touched, and
`invoice_lines.variant` only widens its CHECK — existing `'standard'` /
`'reimbursable'` rows stay valid.

**Deployment constraint:** the migration drops the old boolean columns, so schema
and code must ship together. If a zero-downtime window is required, split into
(1) add + backfill `price_tier`, (2) deploy code, (3) drop the booleans.

## Part 1 — Database

New migration `supabase/migrations/20260806010000_price_tier.sql`:

```sql
-- fee_rates: third price for the "เอกชน" tier. NULL = fall back to `amount`.
ALTER TABLE public.fee_rates
  ADD COLUMN amount_private numeric(12,2);

ALTER TABLE public.fee_rates
  ADD CONSTRAINT fee_rates_amount_private_non_negative
    CHECK (amount_private IS NULL OR amount_private >= 0);

-- students: boolean -> three-state tier
ALTER TABLE public.students
  ADD COLUMN price_tier text NOT NULL DEFAULT 'standard'
    CHECK (price_tier IN ('standard', 'reimbursable', 'private'));
UPDATE public.students SET price_tier = 'reimbursable' WHERE is_reimbursable;
ALTER TABLE public.students DROP COLUMN is_reimbursable;

-- student_invoices: same conversion
ALTER TABLE public.student_invoices
  ADD COLUMN price_tier text NOT NULL DEFAULT 'standard'
    CHECK (price_tier IN ('standard', 'reimbursable', 'private'));
UPDATE public.student_invoices SET price_tier = 'reimbursable' WHERE is_reimbursable;
ALTER TABLE public.student_invoices DROP COLUMN is_reimbursable;

-- invoice_lines: widen the snapshot CHECK, existing values remain valid
ALTER TABLE public.invoice_lines DROP CONSTRAINT invoice_lines_variant_check;
ALTER TABLE public.invoice_lines
  ADD CONSTRAINT invoice_lines_variant_check
    CHECK (variant IN ('standard', 'reimbursable', 'private'));
```

## Part 2 — Price selection

`src/lib/finance/pick-fee-amount.ts` — replace the boolean input with the tier:

```ts
export type PriceTier = "standard" | "reimbursable" | "private";

pickFeeAmount({
  tier,
  hasReimbursableVariant,
  amount,
  amountReimbursable,
  amountPrivate,
})
```

Rules (tests first):

| tier | item tiered? | column value | result |
|---|---|---|---|
| `standard` | any | — | `amount`, variant `standard` |
| `reimbursable` | yes | `amountReimbursable` not null | that value, variant `reimbursable` |
| `reimbursable` | yes | null | `amount`, variant `standard` |
| `private` | yes | `amountPrivate` not null | that value, variant `private` |
| `private` | yes | null | `amount`, variant `standard` |
| any | no | — | `amount`, variant `standard` |

Note the fallback records variant `standard`, matching today's behaviour: the
snapshot records the price actually charged, not the tier requested.

## Part 3 — Fee-rate matrix UI

`src/components/finance/fee-rates-matrix.tsx`. The table keeps **one column per fee
item**; only the cell contents change. For items with `hasReimbursableVariant`, the
cell grows from two stacked inputs to three:

```
ปกติ    [        ]
เบิกได้  [        ]
เอกชน   [        ]   ← placeholder "(ว่าง = ใช้ราคาปกติ)"
```

- `DraftCell` gains `amountPrivate`.
- The header badge changes from `2 ราคา` to `3 ราคา`.
- `changedEntries` / `FeeRateUpsertEntry` gain `amountPrivate`.
- Items without the variant are untouched (single input).
- Row locking (`lockedGradeIds`) applies to the new input identically.

## Part 4 — Setting the tier

Three places, all currently boolean toggles:

1. **Student profile** (`student-sheet.tsx:360`) — the on/off switch becomes a
   three-way select/segmented control labelled การเบิก. Default `เบิกไม่ได้`.
   This value is only a **default** for generation, as today.
2. **Invoice generate dialog** (`invoice-generate-dialog.tsx`) — the per-row toggle
   becomes a three-way control; `reimbursableStudentIds: Set<string>` becomes
   `tierByStudentId: Map<string, PriceTier>`, seeded by the renamed
   `src/lib/finance/reimbursable-selection.ts` helper from each student's
   `price_tier`. "ติ๊กทั้งหมด" becomes "ตั้งทั้งหมดเป็น →". The footer count shows
   a per-tier breakdown instead of a single number.
3. **Per-invoice change dialog** (`invoice-reimbursable-dialog.tsx`) — currently a
   "flip it" confirm (`targetValue = !invoice.isReimbursable`); becomes "choose the
   new tier", then recalculates. The existing `paid_amount > 0` guard stays.

## Part 5 — Filters and reports

The invoice list and outstanding report already filter on a string param
(`"all" | "standard" | "reimbursable"`), so this is an additive change: the param
accepts `"private"`, the select gains an `เอกชน` option, and the data layers
(`src/lib/data/reports.ts:107`, `src/lib/queries/reports.ts:156`,
`src/lib/queries/invoices.ts:214`) switch from `.eq("is_reimbursable", bool)` to
`.eq("price_tier", tier)`.

`เบิกได้` means **ราชการ only** — `เอกชน` is its own filter value, never folded in.

## Part 6 — Import / export

`src/lib/students/csv-import.ts`:

- `mapReimbursableLabel` becomes `mapPriceTierLabel`, returning a tier or `null`:
  `เบิกไม่ได้` / empty → `standard`; `เบิกได้` → `reimbursable`; `เอกชน` →
  `private`. **The two legacy words keep working** so existing school files import
  unchanged.
- The error message becomes `สถานะเบิกไม่ถูกต้อง (ต้องเป็น เบิกไม่ได้ เบิกได้ หรือ เอกชน)`.
- Export writes `เอกชน` for the third tier.
- `src/lib/finance/xlsx-import.ts` / `xlsx-format.ts` get the same treatment where
  they reference the flag.

## Part 7 — Everything else (mechanical)

`is_reimbursable` / `isReimbursable` appears 178 times across 32 files. Beyond the
parts above the remainder is renaming through the data layers
(`src/lib/data/*`, `src/lib/queries/*`, `src/lib/actions/*`,
`src/lib/supabase/types.ts`), the students-list badge, and
`fee-item-edit-eligibility.ts` (edit-lock rules must consider the third price).

## Verification

- `pick-fee-amount.test.ts` covers the full table above, including both fallbacks.
- `csv-import.test.ts` covers legacy wording, `เอกชน`, and the invalid case.
- Manual: issue an invoice for a `private` student on a ค่าเทอม item with the เอกชน
  price filled, confirm the line amount and `variant='private'`; then confirm an
  invoice issued before the migration still shows its original total.
