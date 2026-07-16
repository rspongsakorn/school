# Payment detail popup — design

## Problem

The "บันทึกการจ่าย" (payments) table only shows the payment's total amount per
row. To see the fee breakdown (line items, discounts) a user has to click
"ใบเสร็จ", which opens the printable receipt in a new tab. That's a heavy
round trip for what's often just "what did this payment actually cover?".

## Goal

Clicking a row in the payments table opens a popup (dialog) showing the same
itemized breakdown the receipt has — fee line items, discounts, net total —
without navigating away or opening a new tab.

## UI

Approved mockup: clicking a row opens a dialog with:

- Header: student name, then a second line with student code, grade/classroom,
  academic year, and semester (e.g. "รหัส 14362 · ป.1/3 · ปีการศึกษา 2569
  ภาคเรียนที่ 1"), and a close button.
- Sub-header: receipt number, paid date, payment method.
- Body: a table of fee line items (name, amount), a "รวม" (subtotal) row,
  then any discount rows ("หัก ส่วนลด (ชื่อรายการ)", in `--text-danger`),
  then a large "รวมสุทธิ" (net total) line.
- Footer: recorded-by name on the left; "ใบเสร็จ" and "ยกเลิก" buttons on the
  right (moved here from the table row — the row itself no longer carries
  action buttons other than opening the popup).

Built with the existing `Dialog` component (shadcn), consistent with other
dialogs already in this codebase (e.g. void-payment confirmation).

## Data

The fee-item/discount computation already exists in
[receipt-print.ts](../../../src/lib/data/receipt-print.ts)'s
`getReceiptPrintData`, but it's tied to the server Supabase client
(`@/lib/supabase/server`) and pulls in receipt-print-only fields (recorded-by
signature line, school header data) that the popup doesn't need.

**Split it:**

1. Extract the pure transform — raw joined payment row → `{ lineItems,
   subtotal, discounts }` — into a shared, client-agnostic function (e.g.
   `src/lib/finance/receipt-line-items.ts`). No Supabase import; takes the
   already-fetched raw row shape and returns the computed breakdown. Both
   `getReceiptPrintData` (server) and the new client query below call into it,
   so the FIFO/partial-payment/discount logic keeping the receipt printout and
   the popup consistent lives in exactly one place.
2. Add `fetchPaymentDetail(paymentId): Promise<PaymentDetail | null>` to
   `src/lib/queries/payments.ts` (client Supabase client, same pattern as
   `fetchPaymentsFiltered`), returning everything the popup needs: student
   name/code/grade, academic year name, semester number, receipt number, paid
   date, payment method, recorded-by, and the `{ lineItems, subtotal,
   discounts }` from the shared transform.

**Fetching in the UI:** lazy, via `useQuery` keyed by the clicked payment's
id, `enabled: open && !!selectedPaymentId`. Not fetched up front for every row
in the list — only when a row is actually clicked. Cached per payment id for
the session (default react-query caching), so reopening the same row's popup
is instant.

## Interaction

- Clicking anywhere on a table row opens the popup for that payment.
- The existing "ใบเสร็จ" and "ยกเลิก" buttons move into the popup footer.
  Since they're no longer in the row, there's no click-target conflict to
  guard against inside the table itself.
- Desktop table only for now (this mirrors the existing desktop/mobile split
  in `payments-panel.tsx`); the mobile card list keeps its current layout
  unchanged for this iteration.

## Error handling

- The dialog opens immediately using data already in memory from the list row
  (student name, code, grade, amount, receipt number, date, method) — none of
  that waits on the new fetch.
- The line-items table area shows a loading skeleton while
  `fetchPaymentDetail` is in flight, and on failure shows an inline error
  message with a "ลองใหม่" (retry) button that re-triggers the query. The
  rest of the dialog (header, footer buttons) stays usable either way.

## Testing

- Unit test the extracted shared transform (`receipt-line-items.ts`) directly
  — it's already effectively covered by existing behavior in
  `getReceiptPrintData`, but pulling it out gets its own focused test file
  covering the full-payment / partial-payment / discounted-payment branches.
- No new integration/DB test — `fetchPaymentDetail` is a straightforward
  Supabase query composition, consistent with how `fetchPaymentsFiltered` is
  (not) tested today.
- Manual verification in the browser: click a row, confirm the breakdown
  matches what "ใบเสร็จ" shows for the same payment, confirm ยกเลิก / ใบเสร็จ
  buttons still work from inside the popup.

## Out of scope

- Mobile card list click-to-open (kept as-is for this iteration).
- Editing anything from the popup — it's read-only, same as the receipt.
- Changing what data snapshot_data on the payment row stores.
