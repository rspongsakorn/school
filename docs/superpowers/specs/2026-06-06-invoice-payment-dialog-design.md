# Invoice Payment Dialog

**Date:** 2026-06-06
**Status:** Approved

## Problem

Cashiers reviewing the invoice list must navigate away to `/payments` to accept a payment. Adding an inline dialog lets them pay directly from the invoice row without switching pages.

## Solution

New `InvoicePaymentDialog` component mounted in `InvoicesPanel`. Triggered by a "ชำระเงิน" button on unpaid/partial rows. Reuses existing `recordPayment` server action and `getStudentOutstandingAction`.

## Button Visibility

Show "ชำระเงิน" button on rows where `row.status !== "paid"` (unpaid and partial). Sits alongside existing actions (เบิกได้, ส่วนลด, ลบ).

## Dialog Flow

1. **Open** — receives `invoice: InvoiceListRow`, shows student name/code/classroom in header
2. **Fetch** — calls `getStudentOutstandingAction(studentId, semesterId)` to get outstanding invoices
3. **Display** — lists outstanding invoices with amounts; pre-fills amount field with total outstanding
4. **Form fields:**
   - จำนวนเงิน (number input, required, max = total outstanding)
   - วิธีชำระ: เงินสด / โอน (radio/toggle)
   - เลขอ้างอิง (text, required when method = transfer)
   - หมายเหตุ (text, optional)
5. **Submit** — confirmation step → `recordPayment` → print receipt via hidden iframe → close dialog → invalidate `["invoices"]` query

## Error Handling

- Loading state while fetching outstanding invoices
- Validation: amount > 0, amount ≤ total outstanding, transfer ref required when method = transfer
- Server error shown via `toast.error`

## Files

| File | Change |
|---|---|
| `src/components/finance/invoice-payment-dialog.tsx` | New component |
| `src/components/finance/invoices-panel.tsx` | Add state, button, dialog mount |
