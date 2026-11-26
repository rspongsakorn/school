# Pay by Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a parent pays part of an invoice, staff tick which whole lines were paid; receipts show those lines at their real amounts and the outstanding report names the lines still owed.

**Architecture:** A new table `payment_line_allocations` records, per payment, which invoice lines it settled. One SQL function `invoice_line_states(uuid[])` derives each line's paid state and whether the invoice is "tracked"; the RPC, the payment screens and the report all read through it. `record_payment` gains `p_line_ids uuid[] DEFAULT NULL` and validates the selection inside its existing transaction. Old-style ("legacy") invoices keep today's amount-entry flow.

**Tech Stack:** Next.js (App Router, server actions), Supabase Postgres + PostgREST, TypeScript, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-26-pay-by-line-design.md`

## Global Constraints

- Work only in worktree `C:\Users\ErosOwl\Documents\Code\school-pay-by-line`, branch `feat/pay-by-line` (based on `fix/finance-report-fixes`, PR #2). Never touch `C:\Users\ErosOwl\Documents\Code\school` (accounting branch) except to read files.
- Database writes go only to the test project via `.env.school`. **Never** use `.env.local` (live `buayai`). A migration cannot be re-run once applied — get it right first; fix with a corrective migration.
- Never type a password. For browser checks, ask the user to sign in.
- No ledger code: do not add or edit anything under `src/lib/accounting` or accounting migrations.
- Whole lines only: a line is either fully paid by one payment or unpaid. No partial line payment.
- User-facing strings in Thai; identifiers, comments, commit messages in English. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Legacy-report label, verbatim: `ไม่ระบุ (ชำระก่อนระบบใหม่)`. New report column header, verbatim: `รายการที่ค้าง`.

## Definitions (used by every task)

- **Tracked invoice:** has at least one line, `coalesce(discount_value, 0) = 0`, and every active payment allocated to it has at least one `payment_line_allocations` row on this invoice's lines. An invoice with no payments yet is tracked (if it has lines and no invoice-level discount).
- **Paid line:** `amount = 0`, or has a `payment_line_allocations` row whose payment is `status = 'active'`.
- **Legacy invoice:** not tracked. Uses today's amount-entry flow; `p_line_ids` must be NULL.

## Review Focus

1. Same line paid twice (two cashiers, or a stale screen) — the second save must be refused with a clear Thai error, not double-record. Pinned in Task 1 SQL check (pay line, then pay same line again → error).
2. Void then re-pay — after voiding a payment its lines must be selectable again and the invoice total must reconcile. Pinned in Task 1 SQL check.
3. Invoice with an invoice-level discount (`discount_value > 0`, e.g. from XLSX import) — must show the old amount-entry UI, never the picker. Pinned in Task 1 SQL check (`invoice_tracked = false`) and Task 3 test.
4. Bulk payment on a tracked, partly paid invoice — must write line rows for exactly the remaining lines so the invoice stays tracked. Pinned in Task 4 step.
5. Zero-amount lines — never shown as owed, never selectable, never block "paid" status. Pinned in Task 1 SQL check and Task 3 test.

---

### Task 0: Worktree tooling

**Files:**
- Add from accounting branch: `scripts/db-query.mjs`, `scripts/dev-school.mjs`
- Modify: `package.json` (add `"dev:school": "node scripts/dev-school.mjs"`), `.claude/launch.json` (add `dev-school` config: `npm run dev:school`, port 3000)
- Copy (untracked, gitignored): `.env.school` from `../school/.env.school`. Do **not** copy `.env.local`.

- [ ] **Step 1:** `git -C ../school-pay-by-line checkout feat/accounting-gl-screens -- scripts/db-query.mjs scripts/dev-school.mjs`, then add the npm script and launch config entry.
- [ ] **Step 2:** `cp ../school/.env.school ../school-pay-by-line/.env.school`; confirm `git status` does not list it.
- [ ] **Step 3:** `npm ci` in the worktree. Run `npm test` — Expected: all pass (baseline).
- [ ] **Step 4:** `node scripts/db-query.mjs .env.school -c "select count(*) from public.payments"` — Expected: a row count, no error.
- [ ] **Step 5:** Commit `chore: test-database scripts on the pay-by-line branch`.

---

### Task 1: Migration — table, state function, `record_payment`

**Files:**
- Create: `supabase/migrations/20261126000000_payment_line_allocations.sql`
- Create: `scripts/checks/pay-by-line.sql` (assertion script, run in a rolled-back transaction)
- Modify: `src/lib/supabase/types.ts` (table + both functions)

**Interfaces:**
- Produces (SQL):
  - table `public.payment_line_allocations (id uuid pk default gen_random_uuid(), payment_id uuid not null → payments ON DELETE RESTRICT, invoice_line_id uuid not null → invoice_lines ON DELETE RESTRICT, amount numeric(12,2) not null check (amount >= 0), created_at timestamptz not null default now(), unique (payment_id, invoice_line_id))`, indexes on `payment_id` and `invoice_line_id`.
  - `public.invoice_line_states(p_invoice_ids uuid[]) RETURNS TABLE (invoice_id uuid, invoice_line_id uuid, description text, amount numeric, is_paid boolean, invoice_tracked boolean)` — `LANGUAGE sql STABLE SECURITY INVOKER`, granted to `authenticated`.
  - `public.record_payment(...existing 14 params..., p_line_ids uuid[] DEFAULT NULL)`.
- Produces (TS types): `Database["public"]["Tables"]["payment_line_allocations"]`, `Functions["invoice_line_states"]`, `Functions["record_payment"]["Args"]["p_line_ids"]?: string[] | null`.

- [ ] **Step 1: Write the migration.**
  - Table, indexes, RLS: copy the three policies of `payment_discounts` (`20260618000000_payment_discounts.sql`) verbatim, renamed (`payment_line_allocations_admin_all`, `_finance_all`, `_teacher_select`).
  - `invoice_line_states` — the algorithm:
    ```sql
    WITH inv AS (
      SELECT si.id,
             coalesce(si.discount_value, 0) = 0
             AND NOT EXISTS (
               SELECT 1 FROM public.payment_allocations pa
               JOIN public.payments p ON p.id = pa.payment_id AND p.status = 'active'
               WHERE pa.invoice_id = si.id
                 AND NOT EXISTS (
                   SELECT 1 FROM public.payment_line_allocations pla
                   JOIN public.invoice_lines il2 ON il2.id = pla.invoice_line_id
                   WHERE pla.payment_id = pa.payment_id AND il2.invoice_id = si.id))
             AS tracked
      FROM public.student_invoices si WHERE si.id = ANY (p_invoice_ids))
    SELECT il.invoice_id, il.id, il.description, il.amount,
           il.amount = 0 OR EXISTS (
             SELECT 1 FROM public.payment_line_allocations pla
             JOIN public.payments p ON p.id = pla.payment_id AND p.status = 'active'
             WHERE pla.invoice_line_id = il.id),
           inv.tracked
    FROM public.invoice_lines il JOIN inv ON inv.id = il.invoice_id
    ```
  - `record_payment`: `DROP FUNCTION public.record_payment(uuid, uuid, uuid, text, numeric, numeric, numeric, public.payment_method, text, text, uuid, uuid, jsonb, jsonb);` then recreate with the body of `20260703000000_record_payment_validation.sql` plus `p_line_ids uuid[] DEFAULT NULL` as the 15th param, and re-`GRANT EXECUTE ... TO authenticated` on the new signature. Added rules, after the existing invoice lock and checks:
    - `v_tracked := coalesce((SELECT bool_and(invoice_tracked) FROM public.invoice_line_states(ARRAY[p_invoice_id])), false)`.
    - tracked and `p_line_ids IS NULL` → `RAISE EXCEPTION 'line selection required for this invoice' USING ERRCODE = '22023'`.
    - not tracked and `p_line_ids IS NOT NULL` → `'this invoice does not take a line selection'`, 22023.
    - With `p_line_ids`: non-empty; no duplicates (`cardinality = count(distinct)`); every id is a line of `p_invoice_id` with `is_paid = false` (else `'line not payable'`); every `invoiceLineId` in `p_discounts` is in `p_line_ids` (else `'discount on an unselected line'`); `round(p_amount,2) = round(sum(line.amount) − sum(selected discount amounts), 2)` (else `'amount does not match selected lines'`).
    - After inserting `payment_allocations`, insert one `payment_line_allocations` row per selected line, `amount = line.amount − coalesce(that line's discount amount, 0)`.
- [ ] **Step 2: Write `scripts/checks/pay-by-line.sql`.** One script; set an admin JWT first (`set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.profiles WHERE role='admin' LIMIT 1))::text, true)`); pick an unpaid invoice with ≥ 3 lines of nonzero amount, `discount_value` null/0, into temp vars (`DO` block). Assertions (each failure `RAISE EXCEPTION 'CHECK FAILED: …'`; each expected error wrapped in `BEGIN … EXCEPTION WHEN OTHERS THEN … END` and fails if no error):
  1. `invoice_line_states` → all lines `is_paid = false`, `invoice_tracked = true`.
  2. `record_payment` with `p_line_ids = NULL` → error.
  3. Pay lines 1+2 with amount = their sum → succeeds; 2 rows in `payment_line_allocations`; line 3 still unpaid; invoice status `partial`.
  4. Pay line 1 again → error `line not payable`.
  5. Pay line 3 with wrong amount → error `amount does not match selected lines`.
  6. Pay line 3 with a discount on line 1 → error `discount on an unselected line`.
  7. `UPDATE payments SET status='voided'` for the step-3 payment (and restore `paid_amount` as `voidPayment` does) → lines 1+2 unpaid again, invoice still tracked.
  8. A line with `amount = 0` (insert one inside the transaction if none) → `is_paid = true`.
  9. Set the invoice's `discount_value = 100` → `invoice_tracked = false`; `record_payment` with `p_line_ids` → error.
  End with `RAISE NOTICE 'pay-by-line checks passed'`.
- [ ] **Step 3: Apply** — `node scripts/setup-database.mjs --env .env.school`. Expected: only `20261126000000_payment_line_allocations.sql` applied.
- [ ] **Step 4: Run checks** — `node scripts/db-query.mjs .env.school --rollback -f scripts/checks/pay-by-line.sql`. Expected: notice `pay-by-line checks passed`, exit 0, nothing kept.
- [ ] **Step 5: Update `src/lib/supabase/types.ts`** (hand-maintained) with the table and both function signatures; `npx tsc --noEmit` passes.
- [ ] **Step 6: Commit** `feat(finance): record which invoice lines a payment settles`.

---

### Task 2: Pure line-payment logic

**Files:**
- Create: `src/lib/finance/line-payment.ts`, `src/lib/finance/line-payment.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PayableLine = { id: string; description: string; amount: number; isPaid: boolean };
  export type InvoiceLineStates = { tracked: boolean; lines: PayableLine[] };
  /** Groups invoice_line_states rows; tracked = has lines && every row tracked. */
  export function groupLineStates(rows: { invoice_id: string; invoice_line_id: string; description: string; amount: number | string; is_paid: boolean; invoice_tracked: boolean }[]): Map<string, InvoiceLineStates>;
  export function resolveLineSelection(input: { lines: PayableLine[]; selectedLineIds: string[]; discountByLineId: Map<string, number> }):
    | { ok: true; amount: number; allocations: { invoiceLineId: string; amount: number }[] }
    | { ok: false; error: string };
  export function outstandingLinesLabel(input: { status: "unpaid" | "partial" | "paid"; tracked: boolean; unpaidLineNames: string[] }): string;
  ```
- Errors (Thai, exact): empty → `เลือกรายการที่ชำระอย่างน้อย 1 รายการ`; id not in `lines` → `รายการไม่อยู่ในใบแจ้งนี้`; `isPaid` → `รายการนี้ชำระแล้ว`; discount key not selected → `ให้ส่วนลดได้เฉพาะรายการที่เลือก`; discount > line amount → `ส่วนลดเกินยอดรายการ`. Duplicate ids are de-duplicated. Amounts rounded to 2 dp.

- [ ] **Step 1: Write failing tests** (`line-payment.test.ts`):
  - `resolveLineSelection` lines A 8000, B 2500, C 1500 (unpaid): select A,B → `{ ok: true, amount: 10500, allocations: [{A,8000},{B,2500}] }`.
  - same with discount A=500 → amount 10000, allocation A 7500.
  - select [] → error `เลือกรายการที่ชำระอย่างน้อย 1 รายการ`; select C where C `isPaid` → `รายการนี้ชำระแล้ว`; select "X" → `รายการไม่อยู่ในใบแจ้งนี้`; select A with discount on B → `ให้ส่วนลดได้เฉพาะรายการที่เลือก`; select [A, A] → amount 8000, one allocation.
  - `outstandingLinesLabel`: paid → `""`; unpaid → `""`; partial+tracked ["ค่าห้องปรับอากาศ"] → `"ค่าห้องปรับอากาศ"`; partial+tracked two names → `"ค่าอาหาร, ค่าห้องปรับอากาศ"`; partial+legacy → `"ไม่ระบุ (ชำระก่อนระบบใหม่)"`.
  - `groupLineStates`: two invoices → map of 2; string amounts parsed to numbers; invoice with any row `invoice_tracked=false` → `tracked: false`; zero-amount row keeps `isPaid: true`.
- [ ] **Step 2:** `npx vitest run src/lib/finance/line-payment.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3:** Implement in `line-payment.ts`.
- [ ] **Step 4:** Same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(finance): line selection and outstanding-line label logic`.

---

### Task 3: Line states for the payment screens

**Files:**
- Modify: `src/lib/data/invoices.ts` — `OutstandingInvoiceRow` gains `tracked: boolean` and `lines: PayableLine[]`; `getStudentOutstandingInvoices` calls `supabase.rpc("invoice_line_states", { p_invoice_ids })` once for all returned invoices and fills both via `groupLineStates`.
- Modify: `src/lib/queries/invoices.ts` — add `fetchInvoiceLineStates(invoiceId: string): Promise<InvoiceLineStates>` (browser client, same RPC). Keep `fetchInvoiceLines` if other callers use it; otherwise remove it.

**Interfaces:**
- Consumes: `groupLineStates`, `PayableLine`, `InvoiceLineStates` (Task 2).
- Produces: `OutstandingInvoiceRow.tracked`, `OutstandingInvoiceRow.lines: PayableLine[]`, `fetchInvoiceLineStates`.

- [ ] **Step 1:** Implement both; `npx tsc --noEmit` passes.
- [ ] **Step 2:** `npm test` — Expected: all pass.
- [ ] **Step 3: Commit** `feat(finance): payment screens load each line's paid state`.

---

### Task 4: Server actions

**Files:**
- Modify: `src/lib/actions/payments.ts` — `RecordPaymentInput` gains `lineIds?: string[]`; `ExecuteRecordPaymentArgs` gains `lineIds: string[] | null` passed as `p_line_ids`.

**Interfaces:**
- Consumes: `resolveLineSelection`, `groupLineStates` (Task 2); RPC `invoice_line_states`, `record_payment(p_line_ids)` (Task 1).
- Produces: `recordPayment({ ..., lineIds })`.

- [ ] **Step 1: `recordPayment`.** Load line states via RPC. If tracked: `lineIds` required (else `กรุณาเลือกรายการที่ชำระ`); keep the existing discount rules (`resolvePaymentDiscounts`, "discount only when unpaid"); build `discountByLineId` from resolved rows; `resolveLineSelection`; if `round2(input.amount) !== selection.amount` → `ยอดเงินไม่ตรงกับรายการที่เลือก`; skip the old `เมื่อมีส่วนลด ต้องชำระเต็มยอดสุทธิ` rule; pass `lineIds`. If legacy: `lineIds` present → `ใบแจ้งนี้เลือกรายการไม่ได้`; otherwise unchanged, pass `null`.
- [ ] **Step 2: `recordPaymentsBulk`.** Fetch line states for all ids in one RPC call alongside the existing prefetch. Per tracked invoice pass `lineIds` = ids of lines with `isPaid = false`; legacy → `null`. Amount stays the fresh outstanding.
- [ ] **Step 3: Snapshot.** Add `lines: [{ invoiceLineId, description, amount }]` to `snapshot.allocations[0]` when `lineIds` is set.
- [ ] **Step 4:** `npx tsc --noEmit`, `npm test`, `npm run lint` — Expected: clean.
- [ ] **Step 5: SQL-level proof of bulk path:** extend `scripts/checks/pay-by-line.sql` with check 10: after paying lines 1+2, a `record_payment` call with `p_line_ids` = [line 3] and amount = outstanding (what bulk sends) succeeds and the invoice becomes `paid`. Re-run Task 1 Step 4 — Expected: passed.
- [ ] **Step 6: Commit** `feat(finance): payments carry the lines they settle`.

---

### Task 5: Receipts show the paid lines

**Files:**
- Modify: `src/lib/finance/receipt-line-items.ts`, `src/lib/finance/receipt-line-items.test.ts`
- Modify: `src/lib/data/receipt-print.ts`, `src/lib/queries/payments.ts` (~line 258) — add `payment_line_allocations ( amount, invoice_lines ( amount, fee_items ( name ) ) )` to the select and pass it through.

**Interfaces:**
- `computeReceiptLineItems(paymentAllocations, paymentDiscounts, paymentLineAllocations: ReceiptLineAllocationRaw[] = [])` with `export type ReceiptLineAllocationRaw = { amount: string; invoice_lines: { amount: string; fee_items: { name: string } | null } | null }`.
- When `paymentLineAllocations` is non-empty: `lineItems` = one item per row, name `fee_items.name ?? "รายการค่าธรรมเนียม"`, amount = the **line's** amount (`invoice_lines.amount`; discounts listed separately as today). Otherwise today's logic unchanged.

- [ ] **Step 1: Failing tests:** allocation 10500 on a 3-line invoice (8000/2500/1500) with line rows for the first two → `lineItems` = 8000 + 2500, `subtotal` 10500, no 1500 line. With discount 500 on line 1 (line row amount 7500) → item shows 8000, discounts `[{…, 500}]`. Existing tests unchanged and still pass.
- [ ] **Step 2:** `npx vitest run src/lib/finance/receipt-line-items.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3:** Implement and wire both callers.
- [ ] **Step 4:** Same command — PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(finance): receipts list the lines actually paid`.

---

### Task 6: Line picker in both payment screens

**Files:**
- Create: `src/components/finance/invoice-line-picker.tsx`
- Modify: `src/components/finance/invoice-payment-dialog.tsx`, `src/components/finance/payments-panel.tsx`

**Interfaces:**
- Consumes: `PayableLine`, `InvoiceLineStates`, `fetchInvoiceLineStates`, `OutstandingInvoiceRow.tracked/lines`, `resolveLineDiscount` (`payment-discount.ts`), `recordPayment({ lineIds })`.
- Produces:
  ```ts
  export type LineDiscountDraft = { value: string; unit: "fixed" | "percent" };
  export function InvoiceLinePicker(props: {
    lines: PayableLine[];                 // renders only !isPaid lines
    selected: Set<string>;
    onSelectedChange: (next: Set<string>) => void;
    discounts: Record<string, LineDiscountDraft>;
    onDiscountsChange: (next: Record<string, LineDiscountDraft>) => void;
    discountsEnabled: boolean;            // true only when the invoice has paidAmount === 0
  }): JSX.Element;
  export function pickerTotal(lines: PayableLine[], selected: Set<string>, discounts: Record<string, LineDiscountDraft>): number;
  ```
- Behaviour: native `<input type="checkbox">` per line (no new UI dependency); discount input disabled on unticked lines and when `!discountsEnabled`; footer `ยอดที่ชำระ` = `pickerTotal`. On open/select of a tracked invoice: all unpaid lines ticked.
- Tracked invoice in either screen: show the picker; the amount field is read-only and equals `pickerTotal`; save disabled when nothing is ticked; submit sends `lineIds = [...selected]` and `amount = pickerTotal`.
- Legacy invoice: today's UI unchanged, plus a muted line `ใบนี้ชำระบางส่วนก่อนมีการเลือกรายการ`.
- Remove each screen's local `resolveOne` duplicate in favour of the picker / `resolveLineDiscount`.

- [ ] **Step 1:** Build the picker and wire `invoice-payment-dialog.tsx` (data from `fetchInvoiceLineStates`).
- [ ] **Step 2:** Wire `payments-panel.tsx` (data from `OutstandingInvoiceRow`).
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run lint`, `npm test` — clean.
- [ ] **Step 4: Commit** `feat(finance): tick the lines a parent is paying for`.

---

### Task 7: Outstanding report column

**Files:**
- Modify: `src/lib/queries/reports.ts` — `OutstandingReportRow` gains `unpaidLinesLabel: string`; `fetchOutstandingReport` calls `invoice_line_states` only for rows with `status === "partial"`, through the existing `fetchInBatches` helper (chunks of `STUDENT_ID_BATCH_SIZE`, concurrency `BATCH_CONCURRENCY`), and fills the label with `outstandingLinesLabel` (unpaid names = `description` of `!isPaid` lines, in line order).
- Modify: `src/components/finance/outstanding-report-panel.tsx` — column `รายการที่ค้าง` right after `ค้าง` in both the list table (~line 489) and the by-room table (~line 444); cell text is `unpaidLinesLabel`, wraps, muted for the legacy label. The print layout uses the same tables, so it follows.

**Interfaces:**
- Consumes: `groupLineStates`, `outstandingLinesLabel` (Task 2).

- [ ] **Step 1:** Implement both; `npx tsc --noEmit`, `npm test`, `npm run lint` — clean.
- [ ] **Step 2: Commit** `feat(reports): outstanding report names the lines still owed`.

---

### Task 8: End-to-end check on the test database

- [ ] **Step 1:** Start `dev-school` (preview tool, from the worktree). Ask the user to sign in; never type credentials.
- [ ] **Step 2:** On a tracked unpaid invoice with ≥ 3 lines (test data): open payment, untick `ค่าห้องปรับอากาศ` (or the last line), save. Expected: receipt lists only the ticked lines at full amounts; invoice `ชำระบางส่วน`.
- [ ] **Step 3:** `/reports/outstanding` shows that invoice with `รายการที่ค้าง` = the unticked line.
- [ ] **Step 4:** Pay again from `/payments`: only the remaining line is shown; save → invoice `ชำระแล้ว`, report row gone from the default (owed) view.
- [ ] **Step 5:** Void the first receipt → its lines are owed again (payment screen and report).
- [ ] **Step 6:** A legacy partial invoice (paid before this change) still pays by amount and shows `ไม่ระบุ (ชำระก่อนระบบใหม่)` in the report.
- [ ] **Step 7:** Void the test payments made here so the test data is left as found. Screenshot the receipt and report for the user.
- [ ] **Step 8:** `npm test`, `npm run lint`, `npm run build` — all clean. Push `feat/pay-by-line` (`git push -u origin feat/pay-by-line`); ask the user before opening a PR (base `fix/finance-report-fixes` while PR #2 is open).

**Deploy note for the user (not a task):** the live database needs `20261126000000_payment_line_allocations.sql` applied when this ships; that is the user's step.
