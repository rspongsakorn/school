# XLSX Historical Payment Backfill Import — Design

## Context

Finance staff currently record historical (already-collected, pre-system) payments via the CSV backfill importer (`src/lib/finance/csv-import.ts`, `importPaymentsBackfill` in `src/lib/actions/payments.ts`, `payment-import-dialog.tsx`). That format expects one row per student with a single `amount` column.

The actual source records kept by staff are Excel workbooks per classroom (e.g. `ประถมศึกษาปีที่ 5/1 นางสุจินดา พรหมสวัสดิ์`) with a richer per-fee-category breakdown, and use font color (in older files) or a literal negative number (going forward) to mark discounted/waived amounts. This CSV-only shape doesn't fit that source data without lossy manual reformatting. This design adds an **XLSX import path** that reads the staff's native file shape directly.

Sample source structure (row 1: class/teacher label; row 3: headers; row 4+: data):

| ลำดับ | รหัสนักเรียน | ชื่อ | สกุล | เบิกได้ | ใบสำคัญ | เบิกไม่ได้ | ค่าอาหารกลางวัน | ค่าเอกสารประกอบการเรียนและวัดผล | ค่าประกัน | ค่าครูสอนภาษาต่างประเทศ | ใบสำคัญ | วันที่ชำระ | หมายเหตุ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 22 | 13777 | ศิริลัดดา | คชรินทร์ | - | - | 2000 | - | 400 | -200 | 500 | 53-2606 | 5/5/2569 | |

(In this example the student's real invoices are: "ค่าธรรมเนียมการศึกษา" ฿2,900 = 2000+400+500, and "ค่าประกันอุบัติเหตุ" ฿200, fully written off via `-200`.)

## Goals

- Import historical payment/discount data directly from the staff's native XLSX file shape — no manual pre-transformation.
- Never create a payment/receipt without real cash received (accounting correctness — see decision below).
- Never silently import against a mismatched or missing invoice — every row must reconcile against real invoice data already in the system before anything is written.
- Partial-failure tolerant: one bad row/group must not block the rest of the file.

## Non-goals

- Auto-creating invoices. Import only allocates against invoices that already exist.
- Supporting the old font-color-as-discount convention. Discounts must be written as literal negative numbers (e.g. `-200`) going forward — color is not read.
- General-purpose XLSX fee-sheet parsing for shapes other than the one documented here (different class sheets may need mapping tweaks in a follow-up if their column sets differ).

## Column mapping → two invoice groups

Each data row can produce up to two independent import "groups", each validated and imported independently:

**Group A — ค่าธรรมเนียมการศึกษา (tuition) invoice**
- `เบิกได้` or `เบิกไม่ได้` (exactly one populated, the other `-`) → base amount; which column is populated determines the expected `is_reimbursable` flag on the invoice (`เบิกได้` → `true`, `เบิกไม่ได้` → `false`)
- `ค่าอาหารกลางวัน`, `ค่าเอกสารประกอบการเรียนและวัดผล`, `ค่าครูสอนภาษาต่างประเทศ` → additional amounts on the same invoice
- First `ใบสำคัญ` + `วันที่ชำระ` → applied to this group's payment (if any)

**Group B — ค่าประกันอุบัติเหตุ (insurance) invoice**
- `ค่าประกัน` → amount for this invoice alone
- Second `ใบสำคัญ` + same `วันที่ชำระ` → applied to this group's payment (if any)

Cell value semantics (any column above):
- `-` → not applicable, skip
- positive number → cash amount collected toward that fee
- negative number (e.g. `-200`) → discount/write-off amount for that fee (no cash, reduces amount owed)

## Validation (per group, independently)

Run in order; first failure rejects the group with a specific reason, other groups/rows continue:

1. **Student lookup** by `รหัสนักเรียน` — not found → "ไม่พบนักเรียน"
2. **Invoice identification** — among the student's open invoices for the current academic year/semester:
   - Group B matches the invoice containing a line whose `fee_items.name` contains "ประกัน"
   - Group A matches the student's other open invoice for the same period
   - Zero or more-than-one candidate → "ไม่พบใบแจ้งหนี้ที่ชัดเจน" / "พบใบแจ้งหนี้มากกว่า 1 ใบ"
3. **`is_reimbursable` match** (Group A only) — populated column (เบิกได้/เบิกไม่ได้) must match invoice's `is_reimbursable` → else "สถานะเบิกได้/เบิกไม่ได้ไม่ตรงกับใบแจ้งหนี้"
4. **Amount match** — sum of all cell values (positive + negative) in the group must equal the invoice's current `total_amount` (before this import's discount is applied) → else "ยอดรวมไม่ตรงกับใบแจ้งหนี้" (shows both numbers)
5. **Already settled** — invoice `status = 'paid'` already → "ใบแจ้งหนี้นี้ชำระแล้ว"

## Execution

Compute per validated group: `netCash = sum(positive cells)`, `discount = sum(|negative cells|)`.

**Path A — `netCash > 0`** (plain backfill, or partial discount + partial cash)
Extend `record_backfill_payment` RPC (`supabase/migrations/20260703000100_record_backfill_payment.sql`) with an optional `p_discount_value` param. Within the existing transaction:
1. Set `discount_type='fixed'`, `discount_value=p_discount_value` on the invoice; recompute `total_amount = subtotal - discount_value`
2. Insert `payments` (`amount = netCash`, `note = ใบสำคัญ`, `paid_at` = parsed date), `payment_allocations`, `receipts` as today
3. Update invoice `paid_amount`/`status` as today

**Path B — `netCash = 0`** (fully written off, e.g. the `-200` insurance example)
No `payments`/`receipts` row — per accounting principle, a receipt represents cash received, and this constraint (`payments.amount > 0`) is already correctly enforced by the schema and should not be bypassed. New RPC `record_backfill_invoice_discount(p_invoice_id, p_discount_value, p_recorded_by)`:
1. Set `discount_type='fixed'`, `discount_value`; recompute `total_amount = subtotal - discount_value` (→ 0)
2. Set `status='paid'`, `paid_amount=0` (existing "paid" logic already treats `paid_amount >= total_amount` as paid; `0 >= 0` holds)
3. Insert a row into new table `invoice_discount_log` (`invoice_id, discount_value, note, recorded_by, created_at`) — the only record of *why* this invoice reads "paid" with ฿0 collected, since no other schema field captures that today.

Both RPCs use the same admin/finance role check as the existing `record_backfill_payment`.

## Import flow / UI

Extend `payment-import-dialog.tsx` to accept `.xlsx` alongside the existing CSV path (parsing via a library that reads both cell values and, only as a defensive fallback for old files, could flag red-font cells as a warning to re-enter as `-N` — but is not otherwise interpreted). After parsing:
- Preview table shows **one row per group** (so one sheet row can yield up to 2 preview rows: tuition + insurance)
- Each preview row shows a status: "จะนำเข้า" (green) or "ข้าม — <reason>" (red)
- Confirm imports only green rows; red rows are skipped, with reasons shown and exportable (e.g. copy/download as text) for staff to fix and re-upload just those rows

Dates: `วันที่ชำระ` is read as Excel's native date type (serial number under the hood) and converted directly — no Buddhist-era text parsing needed here (unlike the CSV path), since Excel's date cells are unambiguous.

`ใบสำคัญ` (voucher number) is stored in `payments.note` for whichever group creates a payment row; for Path B (no payment row) it's stored in `invoice_discount_log.note` instead.

## Testing

- Unit tests for group-splitting/column-mapping logic against representative sheet shapes (full cash, partial discount + cash, full write-off, missing/mismatched invoice, wrong is_reimbursable, already-paid).
- Unit tests for the two RPCs (extended `record_backfill_payment`, new `record_backfill_invoice_discount`) covering the accounting invariants (no payment row on 0-cash paths, `payments_amount_positive` never violated, discount math, status transitions).
- Manual verification: import the actual `Book2.xlsx` sample end-to-end against a seeded student/invoice fixture matching its real invoices (ค่าธรรมเนียมการศึกษา ฿2,900 reimbursable=false, ค่าประกันอุบัติเหตุ ฿200), confirm resulting payment/receipt/discount-log rows.
