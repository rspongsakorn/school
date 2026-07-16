# Payment detail popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a row in the "บันทึกการจ่าย" (payments) table opens a popup showing the itemized fee breakdown for that payment — same data the printed receipt shows — instead of requiring a click into a new tab.

**Architecture:** Extract the fee-line/discount computation that already lives in `getReceiptPrintData` (server-only) into a shared, Supabase-agnostic function. Add a client-side query that reuses it to fetch one payment's detail. Add a new `PaymentDetailDialog` component that fetches lazily (only when opened) and renders the breakdown; wire it into `payments-panel.tsx` by making table rows clickable and moving the existing "ใบเสร็จ"/"ยกเลิก" row buttons into the dialog's footer.

**Tech Stack:** Next.js client components, `@tanstack/react-query`, Supabase JS client, shadcn `Dialog`, Vitest.

---

## File map

- **Create** `src/lib/finance/receipt-line-items.ts` — pure transform: raw payment_allocations/payment_discounts rows → `{ lineItems, subtotal, discounts }`. No Supabase import.
- **Create** `src/lib/finance/receipt-line-items.test.ts` — unit tests for the transform.
- **Modify** `src/lib/data/receipt-print.ts` — call the extracted function instead of computing inline.
- **Modify** `src/lib/queries/payments.ts` — add `PaymentDetail` type and `fetchPaymentDetail(paymentId)`.
- **Create** `src/components/finance/payment-detail-dialog.tsx` — the popup itself.
- **Modify** `src/components/finance/payments-panel.tsx` — clickable rows, remove the row-level "จัดการ" column, render `<PaymentDetailDialog>`.

---

### Task 1: Extract the shared receipt line-items transform

**Files:**
- Create: `src/lib/finance/receipt-line-items.ts`
- Test: `src/lib/finance/receipt-line-items.test.ts`
- Modify: `src/lib/data/receipt-print.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/finance/receipt-line-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeReceiptLineItems } from "@/lib/finance/receipt-line-items";

describe("computeReceiptLineItems", () => {
  it("expands a fully-paid invoice into its individual fee lines", () => {
    const result = computeReceiptLineItems(
      [
        {
          amount: "2000",
          student_invoices: {
            invoice_types: { name: "ค่าเทอม" },
            invoice_lines: [
              { amount: "1500", fee_items: { name: "ค่าเทอม" } },
              { amount: "500", fee_items: { name: "ค่าอาหารกลางวัน" } },
            ],
          },
        },
      ],
      [],
    );
    expect(result.lineItems).toEqual([
      { name: "ค่าเทอม", amount: 1500 },
      { name: "ค่าอาหารกลางวัน", amount: 500 },
    ]);
    expect(result.subtotal).toBe(2000);
    expect(result.discounts).toEqual([]);
  });

  it("expands into fee lines when a discount exists, even if the paid amount is less than the line total", () => {
    const result = computeReceiptLineItems(
      [
        {
          amount: "1000",
          student_invoices: {
            invoice_types: { name: "ค่าเทอม" },
            invoice_lines: [
              { amount: "1200", fee_items: { name: "ค่าอาหารกลางวัน" } },
            ],
          },
        },
      ],
      [{ amount: "200", fee_items: { name: "ค่าอาหารกลางวัน" } }],
    );
    expect(result.lineItems).toEqual([{ name: "ค่าอาหารกลางวัน", amount: 1200 }]);
    expect(result.subtotal).toBe(1200);
    expect(result.discounts).toEqual([{ name: "ค่าอาหารกลางวัน", amount: 200 }]);
  });

  it("consolidates a partial payment (no discount) into one line named after the invoice type", () => {
    const result = computeReceiptLineItems(
      [
        {
          amount: "500",
          student_invoices: {
            invoice_types: { name: "ค่าเทอม" },
            invoice_lines: [
              { amount: "1500", fee_items: { name: "ค่าเทอม" } },
              { amount: "500", fee_items: { name: "ค่าอาหารกลางวัน" } },
            ],
          },
        },
      ],
      [],
    );
    expect(result.lineItems).toEqual([{ name: "ค่าเทอม", amount: 500 }]);
    expect(result.subtotal).toBe(500);
  });

  it("skips an allocation whose invoice is missing", () => {
    const result = computeReceiptLineItems(
      [{ amount: "500", student_invoices: null }],
      [],
    );
    expect(result.lineItems).toEqual([]);
    expect(result.subtotal).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/finance/receipt-line-items.test.ts`
Expected: FAIL — `Cannot find module '@/lib/finance/receipt-line-items'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/finance/receipt-line-items.ts`:

```ts
export type ReceiptAllocationRaw = {
  amount: string;
  student_invoices: {
    invoice_types: { name: string } | null;
    invoice_lines: Array<{
      amount: string;
      fee_items: { name: string } | null;
    }>;
  } | null;
};

export type ReceiptDiscountRaw = {
  amount: string;
  fee_items: { name: string } | null;
};

export type ReceiptLineItem = { name: string; amount: number };
export type ReceiptDiscount = { name: string; amount: number };

export type ReceiptLineItemsResult = {
  lineItems: ReceiptLineItem[];
  subtotal: number;
  discounts: ReceiptDiscount[];
};

/**
 * Turns a payment's raw allocations/discounts into what the receipt shows:
 * full or discounted payments expand to each fee line; an undiscounted
 * partial payment collapses to one line (its true per-fee split isn't
 * knowable from a partial amount) so the printed total can't mismatch.
 */
export function computeReceiptLineItems(
  paymentAllocations: ReceiptAllocationRaw[],
  paymentDiscounts: ReceiptDiscountRaw[],
): ReceiptLineItemsResult {
  const hasDiscount = paymentDiscounts.length > 0;

  const lineItems = paymentAllocations.flatMap((pa) => {
    const inv = pa.student_invoices;
    if (!inv) return [];
    const allocAmount = Number(pa.amount);
    const lines = inv.invoice_lines ?? [];
    const linesTotal =
      Math.round(lines.reduce((sum, l) => sum + Number(l.amount), 0) * 100) / 100;

    if (hasDiscount || Math.round(allocAmount * 100) / 100 === linesTotal) {
      return lines.map((line) => ({
        name: line.fee_items?.name ?? "รายการค่าธรรมเนียม",
        amount: Number(line.amount),
      }));
    }

    return [{ name: inv.invoice_types?.name ?? "รายการค่าธรรมเนียม", amount: allocAmount }];
  });

  const discounts = paymentDiscounts.map((d) => ({
    name: d.fee_items?.name ?? "ส่วนลด",
    amount: Number(d.amount),
  }));

  const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;

  return { lineItems, subtotal, discounts };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/finance/receipt-line-items.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Refactor `receipt-print.ts` to use the shared function**

Open `src/lib/data/receipt-print.ts`. Replace the inline `lineItems`/`discounts`/`subtotal` computation (currently lines 87–114, the block from `const lineItems = (payment.payment_allocations ?? []).flatMap(...)` through `const subtotal = ...`) with:

```ts
  const { lineItems, subtotal, discounts } = computeReceiptLineItems(
    payment.payment_allocations ?? [],
    payment.payment_discounts ?? [],
  );
```

Add the import at the top of the file:

```ts
import { computeReceiptLineItems } from "@/lib/finance/receipt-line-items";
```

The `RawPayment` type in this file already matches `ReceiptAllocationRaw`/`ReceiptDiscountRaw` shapes structurally — no changes needed there.

- [ ] **Step 6: Verify nothing broke**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (existing suite + the 4 new ones)

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance/receipt-line-items.ts src/lib/finance/receipt-line-items.test.ts src/lib/data/receipt-print.ts
git commit -m "refactor(finance): extract receipt line-item computation into a shared, testable function"
```

---

### Task 2: Add `fetchPaymentDetail` client query

**Files:**
- Modify: `src/lib/queries/payments.ts`

- [ ] **Step 1: Add the type and function**

Open `src/lib/queries/payments.ts`. Add this import at the top (alongside the existing `formatStudentName, formatThaiDate` import):

```ts
import { formatStudentName, formatThaiDate, formatThaiDateLong } from "@/lib/format";
import { computeReceiptLineItems, type ReceiptLineItem, type ReceiptDiscount } from "@/lib/finance/receipt-line-items";
```

Add this type and function after `fetchPaymentsFiltered` (after its closing `}` around line 145):

```ts
export type PaymentDetail = {
  receiptNumber: string;
  paidAtLabel: string;
  paymentMethod: "cash" | "transfer";
  academicYearName: string;
  semesterNumber: number;
  studentName: string;
  studentCode: string;
  gradeClassroom: string;
  recordedBy: string;
  lineItems: ReceiptLineItem[];
  subtotal: number;
  discounts: ReceiptDiscount[];
};

type PaymentDetailQueryRow = {
  receipt_number: string;
  payment_method: "cash" | "transfer";
  paid_at: string;
  academic_years: { name: string } | null;
  receipts: {
    snapshot_data: {
      studentName?: string;
      studentCode?: string;
      gradeClassroom?: string;
      recordedBy?: string;
    };
  } | null;
  payment_allocations: Array<{
    amount: string;
    student_invoices: {
      invoice_types: { name: string } | null;
      semesters: { number: number } | null;
      invoice_lines: Array<{ amount: string; fee_items: { name: string } | null }>;
    } | null;
  }>;
  payment_discounts: Array<{ amount: string; fee_items: { name: string } | null }>;
};

export async function fetchPaymentDetail(paymentId: string): Promise<PaymentDetail | null> {
  const supabase = createClient();

  const { data: raw } = await supabase
    .from("payments")
    .select(
      `
      receipt_number,
      payment_method,
      paid_at,
      academic_years ( name ),
      receipts ( snapshot_data ),
      payment_allocations (
        amount,
        student_invoices (
          invoice_types ( name ),
          semesters ( number ),
          invoice_lines ( amount, fee_items ( name ) )
        )
      ),
      payment_discounts (
        amount,
        fee_items ( name )
      )
    `,
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (!raw) return null;
  const payment = raw as unknown as PaymentDetailQueryRow;
  const snapshot = payment.receipts?.snapshot_data ?? {};

  const { lineItems, subtotal, discounts } = computeReceiptLineItems(
    payment.payment_allocations ?? [],
    payment.payment_discounts ?? [],
  );

  const semesterNumber =
    (payment.payment_allocations ?? [])
      .map((pa) => pa.student_invoices?.semesters?.number)
      .find((n) => n != null) ?? 1;

  return {
    receiptNumber: payment.receipt_number,
    paidAtLabel: formatThaiDateLong(payment.paid_at),
    paymentMethod: payment.payment_method,
    academicYearName: payment.academic_years?.name ?? "—",
    semesterNumber,
    studentName: snapshot.studentName ?? "—",
    studentCode: snapshot.studentCode ?? "—",
    gradeClassroom: snapshot.gradeClassroom ?? "—",
    recordedBy: snapshot.recordedBy ?? "—",
    lineItems,
    subtotal,
    discounts,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/payments.ts
git commit -m "feat(finance): add fetchPaymentDetail client query for the payment detail popup"
```

---

### Task 3: Build the `PaymentDetailDialog` component

**Files:**
- Create: `src/components/finance/payment-detail-dialog.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/finance/payment-detail-dialog.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBaht } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import { fetchPaymentDetail } from "@/lib/queries/payments";
import type { PaymentListRow } from "@/lib/queries/payments";

export function PaymentDetailDialog({
  payment,
  onClose,
  onVoid,
}: {
  payment: PaymentListRow | null;
  onClose: () => void;
  onVoid: (payment: PaymentListRow) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payment-detail", payment?.id],
    queryFn: () => fetchPaymentDetail(payment!.id),
    enabled: payment !== null,
  });

  return (
    <Dialog open={payment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {payment ? (
          <>
            <DialogHeader>
              <DialogTitle>{payment.studentName}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                รหัส {payment.studentCode} · {payment.gradeClassroom}
                {data ? ` · ปีการศึกษา ${data.academicYearName} ภาคเรียนที่ ${data.semesterNumber}` : null}
              </p>
            </DialogHeader>

            <div className="flex justify-between border-y border-border py-2 text-sm text-muted-foreground">
              <span>เลขที่ {payment.receiptNumber}</span>
              <span>
                {payment.paidAtLabel} · {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
              </span>
            </div>

            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด...</p>
            ) : isError || !data ? (
              <div className="py-6 text-center">
                <p className="mb-2 text-sm text-muted-foreground">โหลดรายละเอียดไม่สำเร็จ</p>
                <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
                  ลองใหม่
                </Button>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                {data.lineItems.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="tabular-nums">{formatBaht(item.amount)}</span>
                  </div>
                ))}

                {data.discounts.length > 0 ? (
                  <>
                    <div className="flex justify-between border-t border-border pt-1">
                      <span className="text-muted-foreground">รวม</span>
                      <span className="tabular-nums">{formatBaht(data.subtotal)}</span>
                    </div>
                    {data.discounts.map((d, i) => (
                      <div key={i} className="flex justify-between text-destructive">
                        <span>หัก ส่วนลด ({d.name})</span>
                        <span className="tabular-nums">−{formatBaht(d.amount)}</span>
                      </div>
                    ))}
                  </>
                ) : null}

                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <span className="font-medium">รวมสุทธิ</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatBaht(payment.amount)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {data ? `ผู้รับเงิน: ${data.recordedBy}` : null}
              </span>
              <div className="flex gap-2">
                <a href={`/receipts/${payment.id}`} target="_blank" rel="noopener noreferrer">
                  <Button type="button" size="sm" variant="outline">
                    ใบเสร็จ
                  </Button>
                </a>
                {payment.status === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => onVoid(payment)}
                  >
                    ยกเลิก
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/payment-detail-dialog.tsx
git commit -m "feat(finance): add PaymentDetailDialog component"
```

---

### Task 4: Wire the popup into `payments-panel.tsx`

**Files:**
- Modify: `src/components/finance/payments-panel.tsx`

- [ ] **Step 1: Import the new component**

Add near the other finance component imports (after the `XlsxPaymentImportDialog` import, around line 39):

```ts
import { PaymentDetailDialog } from "@/components/finance/payment-detail-dialog";
```

- [ ] **Step 2: Add state for the selected row**

Find the existing `voidTarget` state declaration (search for `setVoidTarget` — it's declared with `useState<PaymentListRow | null>(null)`). Add a sibling state right after it:

```ts
const [detailPayment, setDetailPayment] = useState<PaymentListRow | null>(null);
```

- [ ] **Step 3: Remove the "จัดการ" column and its buttons from the desktop table, make rows clickable**

In the desktop `<Table>` block, find the header row:

```tsx
                      <TableRow>
                        <TableHead>เลขที่</TableHead>
                        <TableHead>รหัส</TableHead>
                        <TableHead>นักเรียน</TableHead>
                        <TableHead>ชั้น/ห้อง</TableHead>
                        <TableHead>วันที่</TableHead>
                        <TableHead>วิธี</TableHead>
                        <TableHead className="text-right">จำนวน</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead className="text-right">จัดการ</TableHead>
                      </TableRow>
```

Replace with (drop the last `<TableHead>`):

```tsx
                      <TableRow>
                        <TableHead>เลขที่</TableHead>
                        <TableHead>รหัส</TableHead>
                        <TableHead>นักเรียน</TableHead>
                        <TableHead>ชั้น/ห้อง</TableHead>
                        <TableHead>วันที่</TableHead>
                        <TableHead>วิธี</TableHead>
                        <TableHead className="text-right">จำนวน</TableHead>
                        <TableHead>สถานะ</TableHead>
                      </TableRow>
```

Find the empty-state row:

```tsx
                        <TableRow>
                          <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                            ไม่พบรายการการชำระ
                          </TableCell>
                        </TableRow>
```

Change `colSpan={9}` to `colSpan={8}`.

Find the row-rendering block:

```tsx
                        displayedPayments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="tabular-nums">{p.receiptNumber}</TableCell>
                            <TableCell className="tabular-nums">{p.studentCode}</TableCell>
                            <TableCell>{p.studentName}</TableCell>
                            <TableCell className="text-muted-foreground">{p.gradeClassroom}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {p.paidAtLabel}
                            </TableCell>
                            <TableCell>{PAYMENT_METHOD_LABELS[p.paymentMethod]}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatBaht(p.amount)}
                            </TableCell>
                            <TableCell>
                              {p.status === "active" ? (
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                  ปกติ
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">ยกเลิก</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <a href={`/receipts/${p.id}`} target="_blank" rel="noopener noreferrer">
                                  <Button type="button" size="sm" variant="outline">
                                    ใบเสร็จ
                                  </Button>
                                </a>
                                {p.status === "active" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive"
                                    onClick={() => setVoidTarget(p)}
                                  >
                                    ยกเลิก
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
```

Replace with (drop the last `<TableCell>`, add `onClick`/`cursor-pointer` to `<TableRow>`):

```tsx
                        displayedPayments.map((p) => (
                          <TableRow
                            key={p.id}
                            className="cursor-pointer"
                            onClick={() => setDetailPayment(p)}
                          >
                            <TableCell className="tabular-nums">{p.receiptNumber}</TableCell>
                            <TableCell className="tabular-nums">{p.studentCode}</TableCell>
                            <TableCell>{p.studentName}</TableCell>
                            <TableCell className="text-muted-foreground">{p.gradeClassroom}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {p.paidAtLabel}
                            </TableCell>
                            <TableCell>{PAYMENT_METHOD_LABELS[p.paymentMethod]}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatBaht(p.amount)}
                            </TableCell>
                            <TableCell>
                              {p.status === "active" ? (
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                  ปกติ
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">ยกเลิก</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
```

Note: the mobile card list (the `sm:hidden` block right above the desktop table) keeps its own "ใบเสร็จ"/"ยกเลิก" buttons unchanged — out of scope per the design.

- [ ] **Step 4: Render the dialog**

Find the closing `</AlertDialog>` for the `voidTarget` dialog (the block with `ยกเลิกใบเสร็จ` title), immediately followed by:

```tsx
          {ctx ? (
            <PaymentImportDialog
```

Insert the new dialog between them:

```tsx
          <PaymentDetailDialog
            payment={detailPayment}
            onClose={() => setDetailPayment(null)}
            onVoid={(p) => {
              setDetailPayment(null);
              setVoidTarget(p);
            }}
          />

          {ctx ? (
            <PaymentImportDialog
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/payments-panel.tsx
git commit -m "feat(finance): open a detail popup on payment row click instead of row-level action buttons"
```

---

### Task 5: Manual browser verification

- [ ] **Step 1: Start the dev server and open the payments page**

Use the `run` skill or `preview_start` to launch the app, navigate to the "บันทึกการจ่าย" page for a semester with existing payments.

- [ ] **Step 2: Click a row, verify the popup**

Click any payment row. Confirm:
- The popup opens showing student name, code, grade/classroom, academic year, semester.
- Receipt number, date, payment method show correctly.
- Fee line items match what `/receipts/<id>` shows for the same payment.
- If the payment had a discount, the discount line and "รวม"/"รวมสุทธิ" rows appear correctly (use the 2569/00011 payment fixed earlier as a known discounted example, if present in the test data).

- [ ] **Step 3: Verify the footer buttons**

From inside the popup: click "ใบเสร็จ" — confirm it opens `/receipts/<id>` in a new tab. Click "ยกเลิก" (on an active payment) — confirm the popup closes and the void confirmation dialog opens with the correct receipt number.

- [ ] **Step 4: Verify the mobile layout is unaffected**

Resize to a mobile viewport (or use `resize_window` with the `mobile` preset). Confirm the card list still shows its own "ใบเสร็จ"/"ยกเลิก" buttons per-card, unchanged, and that tapping elsewhere on a mobile card does not open the new popup.

- [ ] **Step 5: Screenshot for the record**

Take a screenshot of the open popup as verification evidence.
