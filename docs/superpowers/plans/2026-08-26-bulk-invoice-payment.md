# Bulk Invoice Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let finance tick several invoices on the invoices page, record them all as full-outstanding payments in one action, and print every resulting receipt from a single print dialog.

**Architecture:** A pure selection module decides which ticked rows are payable. A new server action loops over those invoices sequentially, reusing the existing `record_payment` RPC through a helper extracted from `recordPayment`, so each student still gets their own payment row, receipt row, and receipt number. A new dialog collects the batch-wide method/remark/note and shows the per-row outcome. A new `/receipts/batch` route renders every receipt back-to-back, reusing a `ReceiptCopy` component extracted from the existing single-receipt page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres RPC), TanStack Query, shadcn/ui + Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-bulk-invoice-payment-design.md`

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `src/lib/finance/bulk-payment-selection.ts` | Pure: split ticked rows into payable/skipped, sum the batch | Create |
| `src/lib/finance/bulk-payment-selection.test.ts` | vitest coverage for the above | Create |
| `src/lib/actions/payments.ts` | Extract `executeRecordPayment`; add `recordPaymentsBulk` | Modify |
| `src/app/receipts/receipt-copy.tsx` | Shared A5 receipt markup + print styles | Create |
| `src/app/receipts/auto-print.tsx` | Moved up from `[paymentId]/` so both routes use it | Move |
| `src/app/receipts/logo-image.tsx` | Moved up from `[paymentId]/` | Move |
| `src/app/receipts/print-button.tsx` | Moved up from `[paymentId]/` | Move |
| `src/app/receipts/[paymentId]/page.tsx` | Single receipt — now consumes the shared component | Modify |
| `src/app/receipts/batch/page.tsx` | Many receipts in one document | Create |
| `src/components/finance/bulk-payment-dialog.tsx` | Batch form → confirm → result → print | Create |
| `src/components/finance/invoices-panel.tsx` | Selection rules + "รับชำระที่เลือก" button | Modify |

---

### Task 1: Selection module

**Files:**
- Create: `src/lib/finance/bulk-payment-selection.ts`
- Test: `src/lib/finance/bulk-payment-selection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/finance/bulk-payment-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  resolveBulkPaymentTargets,
  summarizeTargets,
  type BulkPaymentCandidate,
} from "./bulk-payment-selection";

function row(
  id: string,
  outstanding: number,
  studentName = `นักเรียน ${id}`,
): BulkPaymentCandidate {
  return {
    id,
    studentCode: `S${id}`,
    studentName,
    gradeClassroom: "ป.4/2",
    invoiceName: "ค่าประกันอุบัติเหตุ",
    outstanding,
  };
}

describe("resolveBulkPaymentTargets", () => {
  it("keeps only the ticked rows, in table order", () => {
    const rows = [row("1", 300), row("2", 300), row("3", 300)];
    const result = resolveBulkPaymentTargets(rows, new Set(["3", "1"]));
    expect(result.payable.map((r) => r.id)).toEqual(["1", "3"]);
    expect(result.skipped).toEqual([]);
  });

  it("moves ticked rows with no outstanding balance into skipped", () => {
    const rows = [row("1", 300), row("2", 0, "สมชาย ใจดี")];
    const result = resolveBulkPaymentTargets(rows, new Set(["1", "2"]));
    expect(result.payable.map((r) => r.id)).toEqual(["1"]);
    expect(result.skipped).toEqual([
      { id: "2", studentName: "สมชาย ใจดี", reason: "ไม่มียอดค้างชำระ" },
    ]);
  });

  it("returns empty groups when nothing is ticked", () => {
    const result = resolveBulkPaymentTargets([row("1", 300)], new Set());
    expect(result).toEqual({ payable: [], skipped: [] });
  });

  it("ignores ticked ids that are not on the current page", () => {
    const result = resolveBulkPaymentTargets([row("1", 300)], new Set(["1", "999"]));
    expect(result.payable.map((r) => r.id)).toEqual(["1"]);
  });
});

describe("summarizeTargets", () => {
  it("counts rows and sums the outstanding amounts", () => {
    expect(summarizeTargets([row("1", 300), row("2", 450.5)])).toEqual({
      count: 2,
      totalAmount: 750.5,
    });
  });

  it("rounds the total to 2 decimals", () => {
    expect(summarizeTargets([row("1", 0.1), row("2", 0.2)]).totalAmount).toBe(0.3);
  });

  it("returns a zero summary for an empty batch", () => {
    expect(summarizeTargets([])).toEqual({ count: 0, totalAmount: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/finance/bulk-payment-selection.test.ts`
Expected: FAIL — `Failed to resolve import "./bulk-payment-selection"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/finance/bulk-payment-selection.ts`:

```ts
export type BulkPaymentCandidate = {
  id: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  invoiceName: string;
  outstanding: number;
};

export type BulkPaymentSkipped = {
  id: string;
  studentName: string;
  reason: string;
};

export type BulkPaymentTargets = {
  payable: BulkPaymentCandidate[];
  skipped: BulkPaymentSkipped[];
};

/**
 * Splits the ticked rows into the ones a batch payment can charge in full and
 * the ones it must leave alone. Table order is preserved because receipt
 * numbers are issued in the order the rows are submitted.
 */
export function resolveBulkPaymentTargets(
  rows: BulkPaymentCandidate[],
  selectedIds: Set<string>,
): BulkPaymentTargets {
  const payable: BulkPaymentCandidate[] = [];
  const skipped: BulkPaymentSkipped[] = [];

  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue;
    if (row.outstanding > 0) {
      payable.push(row);
    } else {
      skipped.push({
        id: row.id,
        studentName: row.studentName,
        reason: "ไม่มียอดค้างชำระ",
      });
    }
  }

  return { payable, skipped };
}

export function summarizeTargets(payable: BulkPaymentCandidate[]) {
  return {
    count: payable.length,
    totalAmount: round2(payable.reduce((sum, row) => sum + row.outstanding, 0)),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/finance/bulk-payment-selection.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/bulk-payment-selection.ts src/lib/finance/bulk-payment-selection.test.ts
git commit -m "feat(finance): add bulk payment selection logic"
```

---

### Task 2: Extract the payment-write helper

Pure refactor — `recordPayment` keeps the exact same behaviour and result shape. This exists so Task 3 does not duplicate the snapshot/RPC code.

**Files:**
- Modify: `src/lib/actions/payments.ts:96-185` (the tail of `recordPayment`)

- [ ] **Step 1: Add the helper and its types**

Add near the bottom of `src/lib/actions/payments.ts`, just above the existing `revalidateFinancePaths` function:

```ts
type PaymentDiscountRow = {
  invoiceLineId: string;
  feeItemId: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  amount: number;
};

type ExecuteRecordPaymentArgs = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  invoiceId: string;
  invoiceTypeId: string;
  invoiceName: string;
  studentId: string;
  studentCode: string;
  studentName: string;
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
  paidAtIso: string;
  discounts: PaymentDiscountRow[];
};

/**
 * Writes one payment (payment row, allocation, discounts, receipt, invoice
 * balance) through the `record_payment` RPC, which does all of it in a single
 * transaction and assigns the receipt number under an advisory lock. Shared by
 * the single-invoice and bulk actions so the snapshot shape can never drift.
 */
async function executeRecordPayment(
  args: ExecuteRecordPaymentArgs,
): Promise<
  | { ok: true; paymentId: string; receiptNumber: string; snapshot: Record<string, unknown> }
  | { ok: false; error: string }
> {
  // The receipt number is assigned inside the RPC and stamped back into the
  // snapshot there; the placeholder here is overwritten.
  const snapshot: Record<string, unknown> = {
    receiptNumber: "",
    paidAt: args.paidAtIso,
    studentCode: args.studentCode,
    studentName: args.studentName,
    gradeClassroom: args.gradeClassroom,
    paymentMethod: args.paymentMethod,
    transferReference: args.remark,
    amount: args.amount,
    allocations: [
      { invoiceId: args.invoiceId, invoiceName: args.invoiceName, amount: args.amount },
    ],
    recordedBy: args.recordedByName,
  };

  const { data: rpcRows, error: rpcError } = await args.supabase.rpc("record_payment", {
    p_invoice_id: args.invoiceId,
    p_student_id: args.studentId,
    p_academic_year_id: args.academicYearId,
    p_academic_year_name: args.academicYearName,
    p_amount: args.amount,
    p_net_total: args.netTotal,
    p_new_paid: args.newPaid,
    p_payment_method: args.paymentMethod,
    p_transfer_reference: args.remark,
    p_note: args.note,
    p_recorded_by: args.recordedById,
    p_invoice_type_id: args.invoiceTypeId,
    p_snapshot: snapshot,
    p_discounts: args.discounts.map((d) => ({
      invoiceLineId: d.invoiceLineId,
      feeItemId: d.feeItemId,
      discountType: d.discountType,
      discountValue: d.discountValue,
      amount: d.amount,
    })),
  });

  const result = rpcRows?.[0];
  if (rpcError || !result) {
    return { ok: false, error: "ไม่สามารถบันทึกการชำระได้" };
  }

  snapshot.receiptNumber = result.receipt_number;

  return {
    ok: true,
    paymentId: result.payment_id,
    receiptNumber: result.receipt_number,
    snapshot,
  };
}
```

- [ ] **Step 2: Use `PaymentDiscountRow` for the local discount variable**

In `recordPayment`, replace this line:

```ts
  let resolvedDiscounts: { invoiceLineId: string; feeItemId: string; discountType: "percent" | "fixed"; discountValue: number; amount: number }[] = [];
```

with:

```ts
  let resolvedDiscounts: PaymentDiscountRow[] = [];
```

- [ ] **Step 3: Replace the tail of `recordPayment` with a call to the helper**

Delete everything in `recordPayment` from the `const invoiceName = ...` line through the closing `};` of the returned object (the snapshot literal, the `supabase.rpc("record_payment", ...)` call, the `result` check, and the return), and put this in its place:

```ts
  const executed = await executeRecordPayment({
    supabase,
    invoiceId: invoice.id,
    invoiceTypeId,
    invoiceName: invoice.invoice_types?.name ?? "—",
    studentId: input.studentId,
    studentCode: student.student_code,
    studentName: formatStudentName(student.first_name, student.last_name),
    gradeClassroom,
    academicYearId: input.academicYearId,
    academicYearName: input.academicYearName,
    amount: paidTotal,
    netTotal,
    newPaid,
    paymentMethod: input.paymentMethod,
    remark: input.remark?.trim() || null,
    note: input.note?.trim() || null,
    recordedById: auth.profile.id,
    recordedByName: auth.profile.display_name ?? "เจ้าหน้าที่",
    paidAtIso: new Date().toISOString(),
    discounts: resolvedDiscounts,
  });

  if (!executed.ok) return executed;

  revalidateFinancePaths();
  return {
    ok: true,
    paymentId: executed.paymentId,
    receiptNumber: executed.receiptNumber,
    snapshot: executed.snapshot,
  };
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no output (exit 0)

Run: `npm run lint`
Expected: no errors for `src/lib/actions/payments.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "refactor(finance): extract executeRecordPayment helper"
```

---

### Task 3: `recordPaymentsBulk` server action

**Files:**
- Modify: `src/lib/actions/payments.ts` (add after `recordPayment`)

- [ ] **Step 1: Add the action**

Insert directly after the closing brace of `recordPayment` in `src/lib/actions/payments.ts`:

```ts
export const BULK_PAYMENT_MAX = 100;

export type RecordPaymentsBulkInput = {
  invoiceIds: string[];
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  paymentMethod: "cash" | "transfer";
  remark?: string;
  note?: string;
};

export type BulkPaymentSuccess = {
  invoiceId: string;
  paymentId: string;
  receiptNumber: string;
  studentCode: string;
  studentName: string;
  amount: number;
};

export type BulkPaymentFailure = {
  invoiceId: string;
  studentCode: string;
  studentName: string;
  reason: string;
};

export type RecordPaymentsBulkResult =
  | { ok: true; succeeded: BulkPaymentSuccess[]; failed: BulkPaymentFailure[] }
  | { ok: false; error: string };

/**
 * Records a full-outstanding payment for every given invoice, one receipt per
 * student. Invoices are processed sequentially and in the order given so the
 * receipt numbers follow the order the cashier saw on screen. A row that fails
 * is reported and skipped — money already collected for the other students
 * still gets recorded. Discounts are not supported here by design; an invoice
 * needing one goes through the single-invoice dialog.
 */
export async function recordPaymentsBulk(
  input: RecordPaymentsBulkInput,
): Promise<RecordPaymentsBulkResult> {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const ids = [...new Set(input.invoiceIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, error: "กรุณาเลือกใบแจ้งชำระ" };
  }
  if (ids.length > BULK_PAYMENT_MAX) {
    return { ok: false, error: `เลือกได้ครั้งละไม่เกิน ${BULK_PAYMENT_MAX} ใบ` };
  }

  const supabase = await createClient();

  type BulkInvoiceRow = {
    id: string;
    student_id: string;
    total_amount: number;
    paid_amount: number;
    invoice_type_id: string | null;
    invoice_types: { name: string } | null;
  };

  const { data: invoiceRows } = (await supabase
    .from("student_invoices")
    .select("id, student_id, total_amount, paid_amount, invoice_type_id, invoice_types ( name )")
    .in("id", ids)) as unknown as { data: BulkInvoiceRow[] | null };

  const invoiceById = new Map((invoiceRows ?? []).map((row) => [row.id, row]));

  const studentIds = [...new Set((invoiceRows ?? []).map((row) => row.student_id))];
  const studentById = new Map<
    string,
    { id: string; student_code: string; first_name: string; last_name: string }
  >();
  if (studentIds.length > 0) {
    const { data: studentRows } = await supabase
      .from("students")
      .select("id, student_code, first_name, last_name")
      .in("id", studentIds);
    for (const s of studentRows ?? []) studentById.set(s.id, s);
  }

  const gradeByStudent = await getStudentGradeMap(input.semesterId);

  const remark = input.remark?.trim() || null;
  const note = input.note?.trim() || null;
  const recordedByName = auth.profile.display_name ?? "เจ้าหน้าที่";

  const succeeded: BulkPaymentSuccess[] = [];
  const failed: BulkPaymentFailure[] = [];

  for (const invoiceId of ids) {
    const invoice = invoiceById.get(invoiceId);
    if (!invoice) {
      failed.push({ invoiceId, studentCode: "—", studentName: "—", reason: "ไม่พบใบแจ้งชำระ" });
      continue;
    }

    const student = studentById.get(invoice.student_id);
    if (!student) {
      failed.push({ invoiceId, studentCode: "—", studentName: "—", reason: "ไม่พบนักเรียน" });
      continue;
    }

    const studentCode = student.student_code;
    const studentName = formatStudentName(student.first_name, student.last_name);

    if (!invoice.invoice_type_id) {
      failed.push({
        invoiceId,
        studentCode,
        studentName,
        reason: "ใบแจ้งชำระไม่มีประเภทใบแจ้ง",
      });
      continue;
    }

    // Recomputed from the database, never trusted from the client — another
    // cashier may have taken this payment while the rows were ticked.
    const netTotal = Number(invoice.total_amount);
    const paidAmount = Number(invoice.paid_amount);
    const outstanding = round2(netTotal - paidAmount);
    if (outstanding <= 0) {
      failed.push({ invoiceId, studentCode, studentName, reason: "ไม่มียอดค้างชำระ" });
      continue;
    }

    const executed = await executeRecordPayment({
      supabase,
      invoiceId: invoice.id,
      invoiceTypeId: invoice.invoice_type_id,
      invoiceName: invoice.invoice_types?.name ?? "—",
      studentId: invoice.student_id,
      studentCode,
      studentName,
      gradeClassroom: gradeByStudent.get(invoice.student_id) ?? "—",
      academicYearId: input.academicYearId,
      academicYearName: input.academicYearName,
      amount: outstanding,
      netTotal,
      newPaid: round2(paidAmount + outstanding),
      paymentMethod: input.paymentMethod,
      remark,
      note,
      recordedById: auth.profile.id,
      recordedByName,
      paidAtIso: new Date().toISOString(),
      discounts: [],
    });

    if (!executed.ok) {
      failed.push({ invoiceId, studentCode, studentName, reason: "บันทึกการชำระไม่ได้" });
      continue;
    }

    succeeded.push({
      invoiceId,
      paymentId: executed.paymentId,
      receiptNumber: executed.receiptNumber,
      studentCode,
      studentName,
      amount: outstanding,
    });
  }

  revalidateFinancePaths();

  return { ok: true, succeeded, failed };
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no output (exit 0)

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat(finance): add recordPaymentsBulk server action"
```

---

### Task 4: Share the receipt markup

**Files:**
- Move: `src/app/receipts/[paymentId]/auto-print.tsx` → `src/app/receipts/auto-print.tsx`
- Move: `src/app/receipts/[paymentId]/logo-image.tsx` → `src/app/receipts/logo-image.tsx`
- Move: `src/app/receipts/[paymentId]/print-button.tsx` → `src/app/receipts/print-button.tsx`
- Create: `src/app/receipts/receipt-copy.tsx`
- Modify: `src/app/receipts/[paymentId]/page.tsx`

Files inside `app/` that are not `page.tsx`/`route.ts` do not create routes, so these can sit directly in `src/app/receipts/`.

- [ ] **Step 1: Move the three client components**

```bash
git mv "src/app/receipts/[paymentId]/auto-print.tsx" src/app/receipts/auto-print.tsx
git mv "src/app/receipts/[paymentId]/logo-image.tsx" src/app/receipts/logo-image.tsx
git mv "src/app/receipts/[paymentId]/print-button.tsx" src/app/receipts/print-button.tsx
```

They have no relative imports, so their contents need no edit.

- [ ] **Step 2: Create the shared receipt component**

Create `src/app/receipts/receipt-copy.tsx` with this header:

```tsx
import { SCHOOL_CONFIG } from "@/lib/school-config";
import { formatThaiDateLong, bahtText } from "@/lib/format";
import type { ReceiptPrintData } from "@/lib/data/receipt-print";
import { LogoImage } from "./logo-image";

/** A5 page setup shared by the single-receipt and batch-receipt routes. */
export function ReceiptPrintStyles() {
  return (
    <style>{`
        @page { size: A5 portrait; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          .copy { break-after: page; margin: 0 !important; box-shadow: none !important; }
          .copy:last-child { break-after: auto; }
        }
      `}</style>
  );
}

export function ReceiptCopy({ data, label }: { data: ReceiptPrintData; label: string }) {
```

Then move the body of the existing `ReceiptCopy` function — `src/app/receipts/[paymentId]/page.tsx` lines 84-292, everything from `const paidAtLabel = formatThaiDateLong(data.paidAt);` down to the function's closing `}` — into this file **verbatim**. Do not retype it; cut and paste so no styling drifts.

- [ ] **Step 3: Rewrite the single-receipt page to consume it**

Replace `src/app/receipts/[paymentId]/page.tsx` entirely with:

```tsx
import { notFound } from "next/navigation";
import { requireFinancePage } from "@/lib/auth/require-finance";
import { getReceiptPrintData } from "@/lib/data/receipt-print";
import { PrintButton } from "../print-button";
import { AutoPrint } from "../auto-print";
import { ReceiptCopy, ReceiptPrintStyles } from "../receipt-copy";

export const dynamic = "force-dynamic";

export default async function ReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  await requireFinancePage();

  const { paymentId } = await params;
  const { autoprint } = await searchParams;
  const data = await getReceiptPrintData(paymentId);
  if (!data) notFound();

  return (
    <>
      {autoprint ? <AutoPrint /> : null}
      <ReceiptPrintStyles />

      {/* Gray background for screen — hidden on print */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          inset: 0,
          background: "#f3f4f6",
          zIndex: 0,
        }}
      />

      {/* ── Print button (hidden on print) ── */}
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "12px",
          margin: "24px 0 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        <PrintButton />
        <a
          href="/payments"
          style={{
            padding: "8px 16px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#374151",
            textDecoration: "none",
            fontFamily: "inherit",
          }}
        >
          กลับ
        </a>
      </div>

      <ReceiptCopy data={data} label="ต้นฉบับ" />
      <ReceiptCopy data={data} label="สำเนา" />
    </>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no output (exit 0)

Run: `npm run lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/receipts
git commit -m "refactor(receipts): extract shared ReceiptCopy component"
```

---

### Task 5: Batch receipts route

**Files:**
- Create: `src/app/receipts/batch/page.tsx`

- [ ] **Step 1: Create the route**

```tsx
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { requireFinancePage } from "@/lib/auth/require-finance";
import { getReceiptPrintData, type ReceiptPrintData } from "@/lib/data/receipt-print";
import { PrintButton } from "../print-button";
import { AutoPrint } from "../auto-print";
import { ReceiptCopy, ReceiptPrintStyles } from "../receipt-copy";

export const dynamic = "force-dynamic";

/** Matches BULK_PAYMENT_MAX in src/lib/actions/payments.ts. */
const MAX_RECEIPTS = 100;

export default async function BatchReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; autoprint?: string }>;
}) {
  await requireFinancePage();

  const { ids, autoprint } = await searchParams;
  const paymentIds = (ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_RECEIPTS);

  if (paymentIds.length === 0) notFound();

  const fetched = await Promise.all(paymentIds.map((id) => getReceiptPrintData(id)));
  const receipts = fetched.filter((d): d is ReceiptPrintData => d !== null);
  if (receipts.length === 0) notFound();

  return (
    <>
      {autoprint ? <AutoPrint /> : null}
      <ReceiptPrintStyles />

      {/* Gray background for screen — hidden on print */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          inset: 0,
          background: "#f3f4f6",
          zIndex: 0,
        }}
      />

      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "12px",
          margin: "24px 0 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        <PrintButton label={`🖨 พิมพ์ใบเสร็จ ${receipts.length} ใบ`} />
        <a
          href="/invoices"
          style={{
            padding: "8px 16px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#374151",
            textDecoration: "none",
            fontFamily: "inherit",
          }}
        >
          กลับ
        </a>
      </div>

      {receipts.map((data) => (
        <Fragment key={data.receiptNumber}>
          <ReceiptCopy data={data} label="ต้นฉบับ" />
          <ReceiptCopy data={data} label="สำเนา" />
        </Fragment>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no output (exit 0)

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/receipts/batch/page.tsx
git commit -m "feat(receipts): add combined batch receipts page"
```

---

### Task 6: Bulk payment dialog

**Files:**
- Create: `src/components/finance/bulk-payment-dialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  recordPaymentsBulk,
  type BulkPaymentFailure,
  type BulkPaymentSuccess,
} from "@/lib/actions/payments";
import {
  summarizeTargets,
  type BulkPaymentTargets,
} from "@/lib/finance/bulk-payment-selection";
import { formatBaht } from "@/lib/format";
import { invalidateFinanceQueries } from "@/lib/queries/invalidate";

const METHOD_ITEMS = [
  { value: "cash", label: "เงินสด" },
  { value: "transfer", label: "โอน" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: BulkPaymentTargets;
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  /** Called once the batch has been recorded, so the page can clear its selection. */
  onCompleted: () => void;
};

export function BulkPaymentDialog({
  open,
  onOpenChange,
  targets,
  academicYearId,
  academicYearName,
  semesterId,
  onCompleted,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [remark, setRemark] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{
    succeeded: BulkPaymentSuccess[];
    failed: BulkPaymentFailure[];
  } | null>(null);

  const { count, totalAmount } = summarizeTargets(targets.payable);

  useEffect(() => {
    if (!open) return;
    setMethod("cash");
    setRemark("");
    setNote("");
    setResult(null);
    setConfirmOpen(false);
  }, [open]);

  function printBatch(paymentIds: string[]) {
    if (paymentIds.length === 0) return;
    const query = paymentIds.join(",");
    // Loads the receipts inside a hidden iframe; the page auto-prints itself
    // (?autoprint=1). Avoids the popup blocker.
    if (iframeRef.current) {
      iframeRef.current.src = `/receipts/batch?ids=${query}&autoprint=1`;
    } else {
      window.open(`/receipts/batch?ids=${query}`, "_blank", "noopener,noreferrer");
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    const res = await recordPaymentsBulk({
      invoiceIds: targets.payable.map((row) => row.id),
      academicYearId,
      academicYearName,
      semesterId,
      paymentMethod: method,
      remark: remark.trim() || undefined,
      note: note.trim() || undefined,
    });
    setSubmitting(false);
    setConfirmOpen(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    setResult({ succeeded: res.succeeded, failed: res.failed });

    if (res.succeeded.length > 0) {
      toast.success(`บันทึกการชำระแล้ว ${res.succeeded.length} ใบ`);
      printBatch(res.succeeded.map((row) => row.paymentId));
    }
    if (res.failed.length > 0) {
      toast.error(`ไม่สำเร็จ ${res.failed.length} ใบ`);
    }

    invalidateFinanceQueries(queryClient);
    router.refresh();
    onCompleted();
  }

  return (
    <>
      <iframe ref={iframeRef} className="hidden" title="receipts" />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>รับชำระหลายรายการ</DialogTitle>
            <DialogDescription>
              {result
                ? "สรุปผลการบันทึก"
                : `รับเต็มยอดค้างของแต่ละคน — ออกใบเสร็จแยกใบ ${count} ใบ`}
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  บันทึกแล้ว {result.succeeded.length} ใบ
                </p>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ชื่อ</TableHead>
                        <TableHead>เลขที่ใบเสร็จ</TableHead>
                        <TableHead className="text-right">จำนวนเงิน</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.succeeded.map((row) => (
                        <TableRow key={row.paymentId}>
                          <TableCell>{row.studentName}</TableCell>
                          <TableCell className="tabular-nums">{row.receiptNumber}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBaht(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {result.failed.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    ไม่สำเร็จ {result.failed.length} ใบ
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {result.failed.map((row) => (
                      <li key={row.invoiceId}>
                        {row.studentName} ({row.studentCode}) — {row.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={result.succeeded.length === 0}
                  onClick={() => printBatch(result.succeeded.map((row) => row.paymentId))}
                >
                  พิมพ์ใบเสร็จทั้งชุด
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                >
                  ปิด
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="min-w-0 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (count === 0) {
                  toast.error("ไม่มีรายการที่รับชำระได้");
                  return;
                }
                setConfirmOpen(true);
              }}
            >
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>รหัส</TableHead>
                      <TableHead>ชื่อ</TableHead>
                      <TableHead>ชั้น/ห้อง</TableHead>
                      <TableHead>ใบแจ้ง</TableHead>
                      <TableHead className="text-right">ยอดที่จะรับ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {targets.payable.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                        <TableCell>{row.studentName}</TableCell>
                        <TableCell>{row.gradeClassroom}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{row.invoiceName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBaht(row.outstanding)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell colSpan={4}>รวม {count} คน</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(totalAmount)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {targets.skipped.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  ข้าม {targets.skipped.length} รายการที่ไม่มียอดค้างชำระ
                </p>
              ) : null}

              <div className="grid gap-2">
                <Label>วิธีชำระ</Label>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as "cash" | "transfer")}
                  items={METHOD_ITEMS}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bulk-remark">หมายเหตุ</Label>
                <Input
                  id="bulk-remark"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="แสดงในใบเสร็จทุกใบ เช่น รับผ่านครูประจำชั้น (ไม่บังคับ)"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bulk-note">หมายเหตุภายใน</Label>
                <Input
                  id="bulk-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ไม่แสดงในใบเสร็จ (ไม่บังคับ)"
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting || count === 0}>
                {submitting ? "กำลังบันทึก..." : `ยืนยัน ออกใบเสร็จ ${count} ใบ`}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการรับชำระ</AlertDialogTitle>
            <AlertDialogDescription>
              รับชำระ {count} คน รวม {formatBaht(totalAmount)} (
              {method === "cash" ? "เงินสด" : "โอน"}) — ระบบจะออกใบเสร็จแยกใบให้แต่ละคน
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remark.trim() ? (
            <div className="flex justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <span className="shrink-0 text-muted-foreground">หมายเหตุ</span>
              <span className="break-words">{remark.trim()}</span>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction autoFocus onClick={handleConfirm} disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no output (exit 0)

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/bulk-payment-dialog.tsx
git commit -m "feat(finance): add bulk payment dialog"
```

---

### Task 7: Wire the invoices page

Selection currently means "rows I might delete". It becomes "rows I might act on", and each action filters for itself: the delete action already drops non-deletable ids server-side (`src/lib/actions/invoices.ts:295`), and the bulk payment path filters through `resolveBulkPaymentTargets`.

Bulk selection stays desktop-only — the mobile stacked cards have no checkbox today and gain none.

**Files:**
- Modify: `src/components/finance/invoices-panel.tsx`

- [ ] **Step 1: Add the imports**

Alongside the other `@/components/finance/...` imports:

```tsx
import { BulkPaymentDialog } from "@/components/finance/bulk-payment-dialog";
```

Alongside the other `@/lib/finance/...` imports:

```tsx
import { resolveBulkPaymentTargets } from "@/lib/finance/bulk-payment-selection";
```

- [ ] **Step 2: Add dialog state**

Next to the existing `const [paymentOpen, setPaymentOpen] = useState(false);`:

```tsx
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
```

- [ ] **Step 3: Replace the delete-driven selection memos with outstanding-driven ones**

Replace this block:

```tsx
  const deletableRows = useMemo(
    () => data.rows.filter((row) => canDeleteInvoice(deleteContextFor(row))),
    [data.rows],
  );

  const allDeletableSelected =
    deletableRows.length > 0 && deletableRows.every((row) => selectedIds.has(row.id));
```

with:

```tsx
  // Selection now means "rows I might act on". Any row with money still owed
  // can be ticked; each bulk action filters the selection for itself.
  const payableRows = useMemo(
    () => data.rows.filter((row) => row.outstanding > 0),
    [data.rows],
  );

  const allPayableSelected =
    payableRows.length > 0 && payableRows.every((row) => selectedIds.has(row.id));

  const bulkTargets = useMemo(
    () => resolveBulkPaymentTargets(data.rows, selectedIds),
    [data.rows, selectedIds],
  );
```

`InvoiceListRow` already carries every field of `BulkPaymentCandidate`, so `data.rows` is passed straight through.

- [ ] **Step 4: Point select-all at the payable rows**

Replace the body of `toggleSelectAll`:

```tsx
  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(payableRows.map((row) => row.id)));
  }
```

- [ ] **Step 5: Update the header checkbox**

Replace it with:

```tsx
                          <input
                            type="checkbox"
                            className="size-4 rounded border-border"
                            checked={allPayableSelected}
                            disabled={payableRows.length === 0}
                            aria-label="เลือกทั้งหมดที่ยังมียอดค้าง"
                            onChange={(e) => toggleSelectAll(e.target.checked)}
                          />
```

- [ ] **Step 6: Update the row checkbox**

Replace it with:

```tsx
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-border"
                                  checked={selectedIds.has(row.id)}
                                  disabled={row.outstanding <= 0}
                                  title={row.outstanding <= 0 ? "ไม่มียอดค้างชำระ" : undefined}
                                  aria-label={`เลือก ${row.studentCode}`}
                                  onChange={(e) => toggleRow(row.id, e.target.checked)}
                                />
```

The row's `deleteCtx` / `deletable` / `blockedReason` locals stay — the per-row delete button still uses them.

- [ ] **Step 7: Add the bulk payment button**

In the button row, immediately before the existing `{bulkDeleteCount > 0 ? (` block:

```tsx
                    {bulkTargets.payable.length > 0 ? (
                      <Button type="button" onClick={() => setBulkPayOpen(true)}>
                        รับชำระที่เลือก ({bulkTargets.payable.length})
                      </Button>
                    ) : null}
```

- [ ] **Step 8: Render the dialog**

Immediately after the existing `<InvoicePaymentDialog ... />` element:

```tsx
                <BulkPaymentDialog
                  open={bulkPayOpen}
                  onOpenChange={setBulkPayOpen}
                  targets={bulkTargets}
                  academicYearId={ctx.academicYearId}
                  academicYearName={ctx.academicYearName}
                  semesterId={ctx.semesterId}
                  onCompleted={() => setSelectedIds(new Set())}
                />
```

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no output (exit 0)

Run: `npm run lint`
Expected: no errors — in particular no "deletableRows is defined but never used"

- [ ] **Step 10: Run the whole test suite**

Run: `npm test`
Expected: all suites pass

- [ ] **Step 11: Commit**

```bash
git add src/components/finance/invoices-panel.tsx
git commit -m "feat(finance): bulk receive payment from the invoices page"
```

---

### Task 8: End-to-end verification

No automated harness covers server actions in this repo, so this batch path is checked by hand against the dev database before the branch is considered done.

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open `/invoices` and sign in as an admin or finance user.

- [ ] **Step 2: Verify selection rules**

Filter by a grade and classroom. Confirm: rows with `ค้าง` > 0 are tickable (including any `ชำระบางส่วน` row), fully paid rows are not, and the header checkbox ticks every row that still owes money.

- [ ] **Step 3: Record a batch of three**

Tick three unpaid invoices, click `รับชำระที่เลือก (3)`, check the table lists the three students with their outstanding amounts and the correct total, enter a remark such as `รับผ่านครูประจำชั้น`, confirm.

Expected: success toast `บันทึกการชำระแล้ว 3 ใบ`, the result view lists three receipt numbers that are **sequential**, and the print dialog opens once showing 6 A5 pages (ต้นฉบับ + สำเนา per student) with the remark printed on each.

- [ ] **Step 4: Verify the records landed**

Open `/payments` and confirm three separate receipts exist with the right amounts, method, and remark. Open one receipt from the list and confirm it renders identically to before this change.

- [ ] **Step 5: Verify partial failure reporting**

Tick two invoices. Before confirming, open a second browser tab and pay one of them through the normal single-payment dialog. Return to the first tab and confirm the batch.

Expected: the result view shows one success and one failure with reason `ไม่มียอดค้างชำระ`, and only one receipt is printed.

- [ ] **Step 6: Verify the delete path still works**

Tick a mix of unpaid and partially paid rows and use `ลบที่เลือก`. Expected: the confirm dialog's existing wording applies and the toast reports how many were skipped — no partially paid invoice is deleted.

- [ ] **Step 7: Commit any fixes**

If any step required a fix, commit it with a `fix(finance):` message and re-run the failing step.

---

## Done when

- `npm test` passes.
- `npx tsc --noEmit` and `npm run lint` are clean.
- Task 8's manual checks all pass.
