# Bulk invoice payment (รับชำระหลายคนพร้อมกัน)

## Purpose

Parents frequently pay small fixed fees — most often ค่าประกันอุบัติเหตุ — to the
homeroom teacher, who then hands the whole classroom's collection to the finance
office at once. Today finance must record each student separately: search the
student, pick the invoice, confirm, print, repeat. For a 40-student classroom
that is 40 passes through the dialog.

This adds a bulk path on the invoices page: tick several invoices, record them
all in one go, get a separate receipt per student (as the law requires), and
print the whole stack with a single print dialog.

The existing XLSX import is not a substitute — it is a backfill tool that forces
`เงินสด`, takes the paid date from the file, and does not print.

## Scope decisions

Settled during brainstorming:

1. **Amount** — always the invoice's full outstanding balance. No per-student
   amount input. A partial payment still goes through the existing one-at-a-time
   dialog.
2. **Selectable rows** — every invoice with `outstanding > 0`, i.e. both
   `ค้างชำระ` and `ชำระบางส่วน`.
3. **Batch fields** — payment method, receipt remark, and internal note are
   entered once and applied to every payment in the batch.
4. **Printing** — one combined receipts page, one print dialog.
5. **Partial failure** — keep going, then report which invoices succeeded and
   which failed with a reason. No all-or-nothing rollback.
6. **Discounts are out of scope** for bulk. A batch payment always sends an empty
   discount list; invoices needing a discount use the per-invoice dialog.

## Selection logic

New pure module `src/lib/finance/bulk-payment-selection.ts`, unit-tested with
vitest alongside the other `src/lib/finance/*.test.ts` files:

```ts
export type BulkPaymentCandidate = {
  id: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  invoiceName: string;
  outstanding: number;
};

export type BulkPaymentTargets = {
  payable: BulkPaymentCandidate[];
  skipped: { id: string; studentName: string; reason: string }[];
};

export function resolveBulkPaymentTargets(
  rows: BulkPaymentCandidate[],
  selectedIds: Set<string>,
): BulkPaymentTargets;

export function summarizeTargets(
  payable: BulkPaymentCandidate[],
): { count: number; totalAmount: number };
```

`resolveBulkPaymentTargets` keeps the selected rows in the order they appear in
the table (which is the order receipt numbers will be issued in) and moves any
row with `outstanding <= 0` into `skipped` with reason `"ไม่มียอดค้างชำระ"`.
`summarizeTargets` rounds the total to 2 decimals with a module-local `round2`,
following the convention already used across `src/lib/finance/` (each module
defines its own private copy rather than importing one).

## Server action

`recordPaymentsBulk` in `src/lib/actions/payments.ts`:

```ts
type RecordPaymentsBulkInput = {
  invoiceIds: string[];
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  paymentMethod: "cash" | "transfer";
  remark?: string;
  note?: string;
};

export type RecordPaymentsBulkResult =
  | {
      ok: true;
      succeeded: {
        invoiceId: string;
        paymentId: string;
        receiptNumber: string;
        studentCode: string;
        studentName: string;
        amount: number;
      }[];
      failed: {
        invoiceId: string;
        studentCode: string;
        studentName: string;
        reason: string;
      }[];
    }
  | { ok: false; error: string };
```

Behaviour:

- `requireFinanceAction()` once, same as `recordPayment`.
- Reject an empty list (`"กรุณาเลือกใบแจ้งชำระ"`) and a list longer than
  `BULK_PAYMENT_MAX = 100` (`"เลือกได้ครั้งละไม่เกิน 100 ใบ"`). 100 matches the
  invoices page's page size, so the cap can never block a full classroom.
- Prefetch in three queries instead of per invoice: the invoices (with
  `invoice_types(name)`), the students, and `getStudentGradeMap(semesterId)`.
- Then loop **sequentially** over `invoiceIds`, in the order given, calling the
  existing `record_payment` RPC per invoice with `p_discounts: []`. Sequential
  ordering means receipt numbers follow the on-screen order; the RPC's advisory
  lock serialises number assignment either way.
- Per-invoice failure reasons (row goes to `failed`, loop continues):
  - invoice not found → `"ไม่พบใบแจ้งชำระ"`
  - `outstanding <= 0` → `"ไม่มียอดค้างชำระ"` (covers the race where another
    cashier just took the payment)
  - missing student row → `"ไม่พบนักเรียน"`
  - missing `invoice_type_id` → `"ใบแจ้งชำระไม่มีประเภทใบแจ้ง"`
  - RPC error → `"บันทึกการชำระไม่ได้"`
- `revalidateFinancePaths()` once after the loop, not per invoice.
- Outstanding is recomputed server-side from `total_amount - paid_amount`; the
  client's number is display-only and never trusted.

### Shared helper

`recordPayment` and `recordPaymentsBulk` must not grow two copies of the snapshot
construction and RPC call. Extract an internal (non-exported) helper in the same
file:

```ts
async function executeRecordPayment(args: {
  supabase: SupabaseClient;
  invoice: { id: string; invoiceTypeId: string; invoiceName: string };
  student: { id: string; studentCode: string; studentName: string };
  gradeClassroom: string;
  academicYearId: string;
  academicYearName: string;
  amount: number;
  netTotal: number;
  newPaid: number;
  paymentMethod: "cash" | "transfer";
  remark: string | null;
  note: string | null;
  recordedById: string;
  recordedByName: string;
  // The shape `recordPayment` already builds inline today; lifted into a named
  // local type when the helper is extracted.
  discounts: {
    invoiceLineId: string;
    feeItemId: string;
    discountType: "percent" | "fixed";
    discountValue: number;
    amount: number;
  }[];
}): Promise<
  | { ok: true; paymentId: string; receiptNumber: string; snapshot: Record<string, unknown> }
  | { ok: false; error: string }
>;
```

`recordPayment` keeps its own fetching, validation, and discount resolution, then
delegates the write; the bulk action delegates once per invoice with
`discounts: []`. Its externally visible behaviour and result shape do not change.

## Invoices page

`src/components/finance/invoices-panel.tsx`:

- Selection stops meaning "rows I might delete" and starts meaning "rows I might
  act on": a row is selectable when `row.outstanding > 0 || canDeleteInvoice(...)`,
  so a partially paid invoice can be ticked for payment even though it cannot be
  deleted, and a fully waived zero-total invoice keeps the bulk-delete it had
  before. The `title` on a disabled checkbox explains why. The header select-all
  covers the same selectable set.
- Each bulk action then derives its own subset from that one selection: payment
  through `resolveBulkPaymentTargets`, delete through a `deletableSelectedIds`
  memo filtered by `canDeleteInvoice`. **Scoping delete client-side is required,
  not cosmetic** — without it, ticking a single partially paid row offers a
  confidently worded, irreversible-sounding delete confirmation that then
  silently deletes nothing, because `deleteInvoices`
  (`src/lib/actions/invoices.ts`) drops non-deletable ids server-side. With the
  scoping, the delete button hides when nothing ticked is deletable and its count
  states what will actually be removed.
- New button next to `ลบที่เลือก`, shown when at least one selected row is
  payable: `รับชำระที่เลือก (n)` where n is the payable count. It opens the new
  dialog.
- Selection continues to reset on page/filter change, unchanged.

## Bulk payment dialog

New file `src/components/finance/bulk-payment-dialog.tsx` — a separate component
rather than more code inside the already 750-line panel.

Props: `open`, `onOpenChange`, `targets: BulkPaymentTargets`, and the semester
context ids.

Two states inside one dialog:

**Form state**
- Table: `รหัสนักเรียน`, `ชื่อ`, `ชั้น/ห้อง`, `ใบแจ้ง`, `ยอดที่จะรับ`
  (right-aligned, tabular), plus a total row `รวม n คน` and the summed amount.
- Any `skipped` rows render below as one muted line per student
  (`{studentName} — {reason}`, using the reason the selection module already
  computes) so nothing silently vanishes.
- Fields: `วิธีชำระ` (labels from `PAYMENT_METHOD_LABELS` in
  `src/lib/finance/constants.ts` — the payments list already uses them, and the
  older dialogs' local copies disagree with it), `หมายเหตุ (พิมพ์บนใบเสร็จ)`,
  `โน้ตภายใน (ไม่พิมพ์)`.
- Submit `ยืนยัน ออกใบเสร็จ n ใบ` opens an `AlertDialog` confirm showing count,
  total, and method — same guard-rail as the single-payment flow.

**Result state**
- `บันทึกแล้ว n ใบ` listing student name + receipt number + amount, closing with
  a total row — the cashier reconciles that figure against the cash the teacher
  handed over, and it can legitimately differ from the total quoted at confirm
  time if a balance moved in between. If any failed, `ไม่สำเร็จ m ใบ` with the
  per-row reason.
- `พิมพ์ใบเสร็จทั้งชุด` sets the hidden iframe's `src` to the batch receipts URL
  (auto-print fires on load); the button stays available so a failed print run
  can be repeated.
- As soon as the batch returns, the dialog invalidates the finance queries via
  `invalidateFinanceQueries(queryClient)`, refreshes the route, and clears the
  page's selection — the result view keeps its own copy of the response, so it
  stays readable while the table behind it updates.
- A thrown request (a dropped connection, or the batch exceeding a platform
  timeout) must still return the dialog to a usable state, and must warn rather
  than invite a retry: payments commit per invoice, so some may already exist.

## Combined receipts page

New route `src/app/receipts/batch/page.tsx`, `dynamic = "force-dynamic"`:

- Query params: `ids` (comma-separated payment ids, capped at
  `BULK_PAYMENT_MAX`) and optional `autoprint`.
- `requireFinancePage()`, then `getReceiptPrintData` for each id via
  `Promise.all`; ids that return null are dropped. If nothing resolves,
  `notFound()`.
- Renders `ต้นฉบับ` + `สำเนา` per payment, in the order given, reusing the same
  `break-after: page` rules so each copy is its own A5 sheet.

### Shared receipt component

`src/app/receipts/[paymentId]/page.tsx` currently holds the `ReceiptCopy` markup
and the `@page` print styles inline (292 lines). Extract both into
`src/app/receipts/receipt-copy.tsx` — exporting `ReceiptCopy` and
`ReceiptPrintStyles` — and have the single-payment route and the batch route both
consume it, so the two can never drift apart visually. `LogoImage`, `PrintButton`
and `AutoPrint` are reused as they are.

## Testing

- vitest unit tests for `resolveBulkPaymentTargets` and `summarizeTargets`:
  fully payable selection, mixed selection with a zero-outstanding row, empty
  selection, order preservation, and total rounding.
- Server actions have no test harness in this repo (only
  `src/lib/actions/users.test.ts` exists, and it covers pure helpers), so
  `recordPaymentsBulk` is verified manually against the dev database: a batch of
  three invoices produces three sequential receipt numbers, and a batch where one
  invoice was paid concurrently reports one failure and two successes.
- Manual check of the batch receipts page: print preview shows 2 sheets per
  student in selection order. Run this at a realistic classroom size (~40 rows,
  ~80 sheets), not just a handful — that is the size this feature exists for,
  and it is also the only way to see how long a full batch takes, since the
  action performs two sequential round trips per invoice.
- `npm run build` is part of the check, not an afterthought. `src/lib/actions/
  payments.ts` carries `"use server"`, where a non-async export silently voids
  every export in the module; `tsc --noEmit` and the vitest suite both pass
  while the build fails. That is exactly how `BULK_PAYMENT_MAX` ended up in
  `src/lib/finance/constants.ts`.

## Out of scope

- Discounts inside a batch.
- Partial amounts inside a batch.
- Selecting across pages or across filter changes.
- Any change to the XLSX/CSV backfill importers.
