# Payment-time Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move discounts from the invoice (set before payment) to the payment step — entered per fee line as baht or %, with invoices always issued at full amount.

**Architecture:** Approach A from the spec. Invoices keep `subtotal` = full price; at payment time the server reduces `total_amount` to the net due and records per-line discount detail in a new `payment_discounts` table. The existing `outstanding = total_amount − paid_amount` formula is untouched. Receipts show full lines + a discount row + net total. Void restores `total_amount` to `subtotal`.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RLS), React Query, Vitest, TypeScript, Tailwind, shadcn-style UI.

Spec: `docs/superpowers/specs/2026-06-18-payment-time-discount-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/20260618000000_payment_discounts.sql` — new table + RLS + indexes
- `src/lib/finance/payment-discount.ts` — pure calc helpers (resolve per-line discount, sum, net due)
- `src/lib/finance/payment-discount.test.ts` — unit tests for the helpers
- `src/lib/data/discount-report.ts` — server data function for the discount report
- `src/components/finance/discount-report-panel.tsx` — discount report UI
- `src/app/(dashboard)/reports/discounts/page.tsx` — discount report route

**Modify:**
- `src/lib/supabase/types.ts` — add `payment_discounts` TableDef
- `src/lib/actions/payments.ts` — `recordPayment` accepts `discounts[]`; `voidPayment` restores total
- `src/components/finance/invoice-payment-dialog.tsx` — per-line discount inputs
- `src/lib/data/receipt-print.ts` — include discounts + subtotal in print data
- `src/app/receipts/[paymentId]/page.tsx` — render discount rows + net total
- `src/components/finance/invoices-panel.tsx` — remove "ส่วนลด" button + dialog usage
- `src/lib/actions/invoices.ts` — remove `updateInvoiceDiscount`
- `src/lib/data/invoices.ts` + `src/lib/queries/invoices.ts` — drop `discountType`/`discountValue` from `InvoiceListRow`
- `src/lib/data/reports.ts` + `src/lib/queries/reports.ts` — drop `discountLabel` from outstanding report
- `src/components/finance/outstanding-report-panel.tsx` — drop discount column
- `src/components/app-sidebar.tsx` — add discount report nav link

**Delete:**
- `src/components/finance/invoice-discount-dialog.tsx`

---

## Task 1: Database migration — `payment_discounts` table

**Files:**
- Create: `supabase/migrations/20260618000000_payment_discounts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Payment-time discounts: per fee line, recorded at the moment of payment.
CREATE TABLE public.payment_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines (id) ON DELETE RESTRICT,
  fee_item_id uuid NOT NULL REFERENCES public.fee_items (id) ON DELETE RESTRICT,
  discount_type public.discount_type NOT NULL,
  discount_value numeric(12, 2) NOT NULL,
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_discounts_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT payment_discounts_value_non_negative CHECK (discount_value >= 0)
);

CREATE INDEX idx_payment_discounts_payment_id ON public.payment_discounts (payment_id);
CREATE INDEX idx_payment_discounts_fee_item_id ON public.payment_discounts (fee_item_id);

ALTER TABLE public.payment_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_discounts_admin_all ON public.payment_discounts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY payment_discounts_finance_all ON public.payment_discounts
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY payment_discounts_teacher_select ON public.payment_discounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.id = payment_id
        AND public.teacher_can_access_student(p.student_id, p.academic_year_id)
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run: `npm run db:reset`
Expected: reset completes with no errors; `payment_discounts` exists.

- [ ] **Step 3: Verify the table**

Run: `npx supabase db diff` (or psql `\d public.payment_discounts`)
Expected: no pending diff — schema matches the migration.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618000000_payment_discounts.sql
git commit -m "feat(finance): add payment_discounts table"
```

---

## Task 2: Add `payment_discounts` to Supabase types

**Files:**
- Modify: `src/lib/supabase/types.ts` (after the `payment_allocations` TableDef, around line 142)

- [ ] **Step 1: Add the TableDef**

Insert after the `payment_allocations: TableDef<{...}>;` block:

```ts
      payment_discounts: TableDef<{
        id: string;
        payment_id: string;
        invoice_line_id: string;
        fee_item_id: string;
        discount_type: "percent" | "fixed";
        discount_value: number;
        amount: number;
      }>;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "feat(finance): type payment_discounts table"
```

---

## Task 3: Pure calc helpers for payment-time discounts

**Files:**
- Create: `src/lib/finance/payment-discount.ts`
- Test: `src/lib/finance/payment-discount.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  resolveLineDiscount,
  resolvePaymentDiscounts,
  type DiscountInput,
} from "./payment-discount";

describe("resolveLineDiscount", () => {
  it("resolves a fixed discount to its baht value", () => {
    expect(resolveLineDiscount(8000, "fixed", 500)).toBe(500);
  });

  it("resolves a percent discount against the line amount", () => {
    expect(resolveLineDiscount(8000, "percent", 10)).toBe(800);
  });

  it("rounds percent results to 2 decimals", () => {
    expect(resolveLineDiscount(333.33, "percent", 10)).toBe(33.33);
  });
});

describe("resolvePaymentDiscounts", () => {
  const lines = [
    { id: "l1", feeItemId: "f1", amount: 8000 },
    { id: "l2", feeItemId: "f2", amount: 2000 },
    { id: "l3", feeItemId: "f3", amount: 1500 },
  ];

  it("computes net due and resolved rows for valid input", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l1", discountType: "fixed", discountValue: 500 },
    ];
    const result = resolvePaymentDiscounts(11500, lines, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalDiscount).toBe(500);
    expect(result.netDue).toBe(11000);
    expect(result.rows).toEqual([
      { invoiceLineId: "l1", feeItemId: "f1", discountType: "fixed", discountValue: 500, amount: 500 },
    ]);
  });

  it("supports discounting multiple lines at once", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l1", discountType: "percent", discountValue: 10 },
      { invoiceLineId: "l2", discountType: "fixed", discountValue: 200 },
    ];
    const result = resolvePaymentDiscounts(11500, lines, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalDiscount).toBe(1000); // 800 + 200
    expect(result.netDue).toBe(10500);
  });

  it("rejects a discount larger than the line amount", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l2", discountType: "fixed", discountValue: 5000 },
    ];
    const result = resolvePaymentDiscounts(11500, lines, input);
    expect(result.ok).toBe(false);
  });

  it("rejects a percent outside 0..100", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l1", discountType: "percent", discountValue: 150 },
    ];
    expect(resolvePaymentDiscounts(11500, lines, input).ok).toBe(false);
  });

  it("rejects a discount for a line not on the invoice", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "nope", discountType: "fixed", discountValue: 100 },
    ];
    expect(resolvePaymentDiscounts(11500, lines, input).ok).toBe(false);
  });

  it("rejects a net due of zero (cannot discount 100%)", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l1", discountType: "fixed", discountValue: 8000 },
      { invoiceLineId: "l2", discountType: "fixed", discountValue: 2000 },
      { invoiceLineId: "l3", discountType: "fixed", discountValue: 1500 },
    ];
    expect(resolvePaymentDiscounts(11500, lines, input).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/finance/payment-discount.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement the helpers**

```ts
export type DiscountType = "percent" | "fixed";

export type DiscountInput = {
  invoiceLineId: string;
  discountType: DiscountType;
  discountValue: number;
};

export type InvoiceLineLite = {
  id: string;
  feeItemId: string;
  amount: number;
};

export type ResolvedDiscountRow = {
  invoiceLineId: string;
  feeItemId: string;
  discountType: DiscountType;
  discountValue: number;
  amount: number;
};

export type ResolvePaymentDiscountsResult =
  | { ok: true; rows: ResolvedDiscountRow[]; totalDiscount: number; netDue: number }
  | { ok: false; error: string };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function resolveLineDiscount(
  lineAmount: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  if (discountType === "percent") {
    return round2(lineAmount * (discountValue / 100));
  }
  return round2(discountValue);
}

export function resolvePaymentDiscounts(
  subtotal: number,
  lines: InvoiceLineLite[],
  input: DiscountInput[],
): ResolvePaymentDiscountsResult {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const rows: ResolvedDiscountRow[] = [];

  for (const d of input) {
    const line = lineById.get(d.invoiceLineId);
    if (!line) {
      return { ok: false, error: "ส่วนลดอ้างถึงรายการที่ไม่อยู่ในใบแจ้ง" };
    }
    if (!Number.isFinite(d.discountValue) || d.discountValue < 0) {
      return { ok: false, error: "มูลค่าส่วนลดไม่ถูกต้อง" };
    }
    if (d.discountType === "percent" && d.discountValue > 100) {
      return { ok: false, error: "ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100" };
    }
    const amount = resolveLineDiscount(line.amount, d.discountType, d.discountValue);
    if (amount > line.amount) {
      return { ok: false, error: "ส่วนลดเกินราคาของรายการ" };
    }
    rows.push({
      invoiceLineId: line.id,
      feeItemId: line.feeItemId,
      discountType: d.discountType,
      discountValue: d.discountValue,
      amount,
    });
  }

  const totalDiscount = round2(rows.reduce((sum, r) => sum + r.amount, 0));
  const netDue = round2(subtotal - totalDiscount);
  if (netDue <= 0) {
    return { ok: false, error: "ยอดสุทธิหลังหักส่วนลดต้องมากกว่า 0" };
  }

  return { ok: true, rows, totalDiscount, netDue };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/finance/payment-discount.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/payment-discount.ts src/lib/finance/payment-discount.test.ts
git commit -m "feat(finance): payment-time discount calc helpers"
```

---

## Task 4: `recordPayment` accepts and persists discounts

**Files:**
- Modify: `src/lib/actions/payments.ts` (`RecordPaymentInput` + `recordPayment`, lines 23–186)

- [ ] **Step 1: Extend the input type**

Add to `RecordPaymentInput` (after `note?: string;`):

```ts
  discounts?: {
    invoiceLineId: string;
    discountType: "percent" | "fixed";
    discountValue: number;
  }[];
```

- [ ] **Step 2: Import the helper**

Add to the imports at the top of the file:

```ts
import { resolvePaymentDiscounts } from "@/lib/finance/payment-discount";
```

- [ ] **Step 3: Load invoice lines and resolve discounts**

In `recordPayment`, the invoice is loaded around line 54. Change its select to also pull `subtotal` and the lines:

```ts
  const { data: invoice } = await supabase
    .from("student_invoices")
    .select(
      "id, subtotal, total_amount, paid_amount, invoice_type_id, student_id, invoice_types ( name ), invoice_lines ( id, fee_item_id, amount )",
    )
    .eq("id", input.invoiceId)
    .maybeSingle() as unknown as { data: (InvoiceRow & {
      subtotal: number;
      invoice_lines: { id: string; fee_item_id: string; amount: number }[];
    }) | null };
```

After the existing `if (invoice.student_id !== input.studentId)` guard, insert discount resolution:

```ts
  const discountInput = input.discounts ?? [];
  let resolvedDiscounts: { invoiceLineId: string; feeItemId: string; discountType: "percent" | "fixed"; discountValue: number; amount: number }[] = [];
  let netTotal = Number(invoice.total_amount);

  if (discountInput.length > 0) {
    if (Number(invoice.paid_amount) > 0) {
      return { ok: false, error: "ให้ส่วนลดได้เฉพาะใบแจ้งที่ยังไม่ชำระ" };
    }
    const resolved = resolvePaymentDiscounts(
      Number(invoice.subtotal),
      (invoice.invoice_lines ?? []).map((l) => ({ id: l.id, feeItemId: l.fee_item_id, amount: Number(l.amount) })),
      discountInput,
    );
    if (!resolved.ok) return { ok: false, error: resolved.error };
    resolvedDiscounts = resolved.rows;
    netTotal = resolved.netDue;
  }
```

- [ ] **Step 4: Settle against the net total**

Replace the `outstanding` computation (lines 65–68) so it uses `netTotal` instead of `invoice.total_amount`:

```ts
  const outstanding = Math.max(
    0,
    Math.round((netTotal - Number(invoice.paid_amount)) * 100) / 100,
  );
```

`resolveSingleInvoicePayment({ amount: input.amount, outstanding })` already caps the cash at `outstanding` (= net due when discounting). Because a discount must settle the invoice in full, add an explicit equality guard right after the discount resolution block (Step 3) — never trust the client's locked field:

```ts
  if (resolvedDiscounts.length > 0 && round2(input.amount) !== round2(netTotal)) {
    return { ok: false, error: "เมื่อมีส่วนลด ต้องชำระเต็มยอดสุทธิ" };
  }
```

(`round2` already exists at the bottom of `payments.ts`.)

- [ ] **Step 5: Persist discount rows + reduce total_amount**

After the `payment_allocations` insert succeeds and before/with the invoice update (around lines 144–182), insert discount rows when present:

```ts
  if (resolvedDiscounts.length > 0) {
    const { error: discountError } = await supabase.from("payment_discounts").insert(
      resolvedDiscounts.map((d) => ({
        payment_id: payment.id,
        invoice_line_id: d.invoiceLineId,
        fee_item_id: d.feeItemId,
        discount_type: d.discountType,
        discount_value: d.discountValue,
        amount: d.amount,
      })),
    );
    if (discountError) {
      await supabase.from("payment_allocations").delete().eq("payment_id", payment.id);
      await supabase.from("payments").delete().eq("id", payment.id);
      return { ok: false, error: "ไม่สามารถบันทึกส่วนลดได้" };
    }
  }
```

Then change the invoice update (around lines 170–182) so the new total reflects the discount:

```ts
  for (const alloc of allocations) {
    const newPaid = round2(Number(invoice.paid_amount) + alloc.amount);
    const newStatus = deriveInvoiceStatus(newPaid, netTotal);

    const { error: updateError } = await supabase
      .from("student_invoices")
      .update({ paid_amount: newPaid, total_amount: netTotal, status: newStatus })
      .eq("id", alloc.invoiceId);

    if (updateError) {
      return { ok: false, error: "ไม่สามารถอัปเดตยอดใบแจ้งได้" };
    }
  }
```

(For the no-discount path `netTotal === invoice.total_amount`, so writing `total_amount` is a harmless no-op.)

- [ ] **Step 6: Typecheck + run existing payment tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; existing suite still passes.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`. Record a payment with a 500 fixed discount on one line of an 11,500 invoice. Verify in DB: `student_invoices.total_amount = 11000`, `status = 'paid'`, one `payment_discounts` row with `amount = 500`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat(finance): record per-line discounts at payment time"
```

---

## Task 5: `voidPayment` restores full total on discounted payments

**Files:**
- Modify: `src/lib/actions/payments.ts` (`voidPayment`, lines 466–526)

- [ ] **Step 1: Detect discounts and restore subtotal on void**

In `voidPayment`, after loading `allocations` (line ~486), load whether this payment carried discounts:

```ts
  const { data: discountRows } = await supabase
    .from("payment_discounts")
    .select("id")
    .eq("payment_id", paymentId);
  const hadDiscount = (discountRows ?? []).length > 0;
```

Then in the allocation reversal loop (lines ~491–507), select `subtotal` too and restore `total_amount` when discounted:

```ts
  for (const alloc of allocations ?? []) {
    const { data: invoice } = await supabase
      .from("student_invoices")
      .select("paid_amount, total_amount, subtotal")
      .eq("id", alloc.invoice_id)
      .maybeSingle();

    if (!invoice) continue;

    const restoredTotal = hadDiscount ? Number(invoice.subtotal) : Number(invoice.total_amount);
    const newPaid = round2(Math.max(0, Number(invoice.paid_amount) - Number(alloc.amount)));
    const newStatus = deriveInvoiceStatus(newPaid, restoredTotal);

    await supabase
      .from("student_invoices")
      .update({ paid_amount: newPaid, total_amount: restoredTotal, status: newStatus })
      .eq("id", alloc.invoice_id);
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Void the discounted payment from Task 4 step 7. Verify `student_invoices.total_amount` is back to `11500`, `paid_amount = 0`, `status = 'unpaid'`. The `payment_discounts` row remains (audit), `payments.status = 'voided'`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat(finance): restore full total when voiding a discounted payment"
```

---

## Task 6: Per-line discount inputs in the payment dialog

**Files:**
- Modify: `src/components/finance/invoice-payment-dialog.tsx`

- [ ] **Step 1: Add discount state**

Inside `InvoicePaymentDialog`, alongside the other `useState` hooks (lines 66–71), add:

```tsx
  // invoiceLineId -> { value: string; unit: "fixed" | "percent" }
  const [lineDiscounts, setLineDiscounts] = useState<
    Record<string, { value: string; unit: "fixed" | "percent" }>
  >({});
```

Reset it when the dialog opens — extend the existing `useEffect` (lines 79–85) to also run `setLineDiscounts({})`.

- [ ] **Step 2: Compute resolved discount + net due (live)**

After the `lines` query (line 77), add a derived calc:

```tsx
  function resolveOne(lineAmount: number, raw?: { value: string; unit: "fixed" | "percent" }) {
    if (!raw) return 0;
    const v = Number.parseFloat(raw.value);
    if (!Number.isFinite(v) || v <= 0) return 0;
    const amount = raw.unit === "percent" ? (lineAmount * v) / 100 : v;
    return Math.min(Math.round(amount * 100) / 100, lineAmount);
  }

  const totalDiscount =
    Math.round(
      lines.reduce((sum, l) => sum + resolveOne(l.amount, lineDiscounts[l.id]), 0) * 100,
    ) / 100;
  const hasDiscount = totalDiscount > 0;
  const subtotal = invoice ? invoice.outstanding : 0; // unpaid invoice: outstanding == full subtotal
  const netDue = Math.round((subtotal - totalDiscount) * 100) / 100;
```

- [ ] **Step 3: Lock the amount field to net due when discounting**

Extend the open effect (lines 79–85): when discounts change, if `hasDiscount`, force `amount` to `netDue`. Add a second effect:

```tsx
  useEffect(() => {
    if (hasDiscount) setAmount(netDue > 0 ? String(netDue) : "");
  }, [hasDiscount, netDue]);
```

In the amount `<Input>` (lines 223–234) add `readOnly={hasDiscount}` so the operator can't override a discounted total.

- [ ] **Step 4: Add a discount column to the line table**

In the invoice line rows (lines 183–192), change each fee line `<TableRow>` to include a discount input + unit toggle. Replace the `lines.map(...)` block with:

```tsx
                      {lines.map((line) => {
                        const d = lineDiscounts[line.id] ?? { value: "", unit: "fixed" as const };
                        const resolved = resolveOne(line.amount, d);
                        return (
                          <TableRow key={line.id} className="border-0">
                            <TableCell className="py-0.5 pl-5 text-xs text-muted-foreground">
                              · {line.description}
                            </TableCell>
                            <TableCell className="py-0.5 text-right text-xs tabular-nums text-muted-foreground">
                              <div className="flex items-center justify-end gap-1">
                                {resolved > 0 ? (
                                  <span className="text-[10px] text-green-700">−{formatBaht(resolved)}</span>
                                ) : null}
                                <Input
                                  value={d.value}
                                  onChange={(e) =>
                                    setLineDiscounts((prev) => ({
                                      ...prev,
                                      [line.id]: { value: e.target.value, unit: d.unit },
                                    }))
                                  }
                                  placeholder="ส่วนลด"
                                  className="h-6 w-16 text-right text-xs"
                                />
                                <button
                                  type="button"
                                  className="text-[10px] text-primary hover:underline w-7"
                                  onClick={() =>
                                    setLineDiscounts((prev) => ({
                                      ...prev,
                                      [line.id]: { value: d.value, unit: d.unit === "fixed" ? "percent" : "fixed" },
                                    }))
                                  }
                                >
                                  {d.unit === "fixed" ? "บาท" : "%"}
                                </button>
                                <span className="w-16 text-right tabular-nums">{formatBaht(line.amount)}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
```

Below the table, show the net due when discounting (after the closing `</Table>`, line 195):

```tsx
                {hasDiscount ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ส่วนลดรวม</span>
                    <span className="tabular-nums text-green-700">−{formatBaht(totalDiscount)}</span>
                  </div>
                ) : null}
```

- [ ] **Step 4b: Client-side guard for net due**

In `handleSubmit` (lines 95–114), after the existing amount checks, add:

```tsx
    if (hasDiscount && netDue <= 0) {
      toast.error("ยอดสุทธิหลังหักส่วนลดต้องมากกว่า 0");
      return;
    }
```

- [ ] **Step 5: Send discounts with the payment**

In `handleConfirm` (lines 116–146), build the discount payload and pass it:

```tsx
    const discounts = lines
      .map((l) => {
        const d = lineDiscounts[l.id];
        if (!d) return null;
        const v = Number.parseFloat(d.value);
        if (!Number.isFinite(v) || v <= 0) return null;
        return { invoiceLineId: l.id, discountType: d.unit, discountValue: v };
      })
      .filter((x): x is { invoiceLineId: string; discountType: "fixed" | "percent"; discountValue: number } => x != null);

    const result = await recordPayment({
      // ...existing fields...
      discounts: discounts.length > 0 ? discounts : undefined,
    });
```

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`. Open a payment for an 11,500 invoice. Enter 500 in the ค่าเล่าเรียน discount box (unit บาท). Confirm: amount field locks to 11,000, "ส่วนลดรวม −฿500.00" shows, submit succeeds, receipt opens.

- [ ] **Step 7: Lint + commit**

```bash
npx eslint src/components/finance/invoice-payment-dialog.tsx
git add src/components/finance/invoice-payment-dialog.tsx
git commit -m "feat(finance): per-line discount inputs in payment dialog"
```

---

## Task 7: Include discounts in receipt print data

**Files:**
- Modify: `src/lib/data/receipt-print.ts`

- [ ] **Step 1: Extend the return type**

Add to `ReceiptPrintData`:

```ts
  subtotal: number;
  discounts: { name: string; amount: number }[];
```

- [ ] **Step 2: Fetch discount rows**

Extend the payments select (lines 51–73) to include discounts:

```ts
      payment_discounts (
        amount,
        fee_items ( name )
      ),
```

Add to the `RawPayment` type:

```ts
  payment_discounts: Array<{ amount: string; fee_items: { name: string } | null }>;
```

- [ ] **Step 3: Build subtotal + discounts, keep full lines when discounted**

After computing `lineItems` (lines 80–98), add:

```ts
  const discounts = (payment.payment_discounts ?? []).map((d) => ({
    name: d.fee_items?.name ?? "ส่วนลด",
    amount: Number(d.amount),
  }));

  const subtotal =
    Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
```

When `discounts.length > 0`, the allocation amount (net) will not equal `linesTotal`, so the existing branch at line 89 would collapse to a single consolidated line. Guard it: change the condition so discounted payments still expand to full lines. Replace the `flatMap` body's branch:

```ts
    // Expand to individual fee lines when the allocation settles the full
    // (pre-discount) line total OR when a discount explains the difference.
    const hasDiscount = (payment.payment_discounts ?? []).length > 0;
    if (hasDiscount || Math.round(allocAmount * 100) / 100 === linesTotal) {
      return lines.map((line) => ({
        name: line.fee_items?.name ?? "รายการค่าธรรมเนียม",
        amount: Number(line.amount),
      }));
    }
```

- [ ] **Step 4: Return the new fields**

Add `subtotal` and `discounts` to the returned object (lines 105–118).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the receipt page will be updated in Task 8 to consume the new fields).

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/receipt-print.ts
git commit -m "feat(finance): expose discounts in receipt print data"
```

---

## Task 8: Render discount rows on the receipt

**Files:**
- Modify: `src/app/receipts/[paymentId]/page.tsx` (the `<tfoot>`, lines 194–238)

- [ ] **Step 1: Replace the tfoot to show subtotal → discount rows → net**

```tsx
          <tfoot>
            {data.discounts.length > 0 ? (
              <>
                <tr>
                  <td style={{ padding: "5px 8px", border: "1px solid #d1d5db", textAlign: "right" }}>รวม</td>
                  <td style={{ textAlign: "right", padding: "5px 8px", border: "1px solid #d1d5db", fontVariantNumeric: "tabular-nums" }}>
                    {data.subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
                {data.discounts.map((d, i) => (
                  <tr key={i}>
                    <td style={{ padding: "5px 8px", border: "1px solid #e5e7eb", color: "#b91c1c" }}>
                      หัก ส่วนลด ({d.name})
                    </td>
                    <td style={{ textAlign: "right", padding: "5px 8px", border: "1px solid #e5e7eb", color: "#b91c1c", fontVariantNumeric: "tabular-nums" }}>
                      −{d.amount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </>
            ) : null}
            <tr style={{ background: "#f0fdf4" }}>
              <td style={{ padding: "6px 8px", border: "1px solid #d1d5db", fontWeight: 800, fontSize: "12px" }}>
                รวมสุทธิ
              </td>
              <td style={{ textAlign: "right", padding: "6px 8px", border: "1px solid #d1d5db", fontWeight: 800, fontSize: "13px", color: "#166534", fontVariantNumeric: "tabular-nums" }}>
                {data.amount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ padding: "5px 8px", border: "1px solid #d1d5db", fontSize: "11px", color: "#374151" }}>
                <span style={{ color: "#6b7280" }}>จำนวนเงินเป็นอักษร: </span>
                <strong>{bahtText(data.amount)}</strong>
              </td>
            </tr>
          </tfoot>
```

(When there are no discounts the label stays "รวมสุทธิ"; if you prefer the original "รวมทั้งสิ้น" wording for non-discount receipts, branch the label on `data.discounts.length`.)

- [ ] **Step 2: Verify in the browser**

Run: `npm run dev`. Open the receipt for the discounted payment. Confirm: full lines (8,000 / 2,000 / 1,500), รวม 11,500, หัก ส่วนลด (ค่าเล่าเรียน) −500, รวมสุทธิ 11,000, baht text = "หนึ่งหมื่นหนึ่งพันบาทถ้วน". Open a non-discount receipt and confirm it still shows just the net total row.

- [ ] **Step 3: Commit**

```bash
git add src/app/receipts/[paymentId]/page.tsx
git commit -m "feat(finance): show discount rows on printed receipt"
```

---

## Task 9: Remove the invoice-level discount feature

**Files:**
- Delete: `src/components/finance/invoice-discount-dialog.tsx`
- Modify: `src/components/finance/invoices-panel.tsx`, `src/lib/actions/invoices.ts`, `src/lib/data/invoices.ts`, `src/lib/queries/invoices.ts`

- [ ] **Step 1: Remove the dialog usage from the invoices panel**

In `src/components/finance/invoices-panel.tsx`:
- Remove the import `import { InvoiceDiscountDialog } from "@/components/finance/invoice-discount-dialog";` (line 42).
- Remove the `discountTarget` state and its setter (grep `discountTarget`).
- Remove both "ส่วนลด" `<Button>` blocks (mobile ~lines 505–514 and the desktop equivalent ~line 647) and the `<InvoiceDiscountDialog ... />` render (~line 727).

- [ ] **Step 2: Delete the dialog file**

Run: `git rm src/components/finance/invoice-discount-dialog.tsx`

- [ ] **Step 3: Remove the server action**

In `src/lib/actions/invoices.ts` delete the entire `updateInvoiceDiscount` function (lines 252–295).

- [ ] **Step 4: Drop discount fields from `InvoiceListRow`**

In both `src/lib/data/invoices.ts` and `src/lib/queries/invoices.ts`:
- Remove `discountType` and `discountValue` from the `InvoiceListRow` type.
- Remove `discount_type, discount_value` from each `student_invoices` select string.
- Remove the `discount_type`/`discount_value` fields from each local `Row` type and from the mapped object literals.

- [ ] **Step 5: Typecheck — fix any remaining references**

Run: `npx tsc --noEmit`
Expected: errors point to any leftover `discountType`/`updateInvoiceDiscount` usage. Remove them until clean.

- [ ] **Step 6: Lint + commit**

```bash
npx eslint src/components/finance/invoices-panel.tsx src/lib/actions/invoices.ts src/lib/data/invoices.ts src/lib/queries/invoices.ts
git add -A
git commit -m "refactor(finance): remove invoice-level discount in favor of payment-time discount"
```

---

## Task 10: Outstanding report — drop the legacy discount column

**Files:**
- Modify: `src/lib/data/reports.ts`, `src/lib/queries/reports.ts`, `src/components/finance/outstanding-report-panel.tsx`

- [ ] **Step 1: Remove `discountLabel` from the data layer**

In both `src/lib/data/reports.ts` and `src/lib/queries/reports.ts`:
- Remove `discountLabel: string;` from `OutstandingReportRow`.
- Remove the `discountLabel` helper function.
- Remove `discount_type, discount_value` from the outstanding select strings and stop setting `discountLabel` in the mapped rows. Keep `subtotal` and `totalAmount`.

- [ ] **Step 2: Remove the discount column from the panel**

In `src/components/finance/outstanding-report-panel.tsx` (the "ส่วนลด" header at line ~357 and its matching `<TableCell>`), delete both the `<TableHead>` and the body cell that render `discountLabel`. Adjust any `colSpan` on empty-state rows to match the new column count.

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/finance/outstanding-report-panel.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/reports.ts src/lib/queries/reports.ts src/components/finance/outstanding-report-panel.tsx
git commit -m "refactor(finance): drop legacy discount column from outstanding report"
```

---

## Task 11: Discount summary report

**Files:**
- Create: `src/lib/data/discount-report.ts`
- Create: `src/components/finance/discount-report-panel.tsx`
- Create: `src/app/(dashboard)/reports/discounts/page.tsx`
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Write the data function (server)**

`src/lib/data/discount-report.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export type DiscountReportItemRow = {
  feeItemId: string;
  feeItemName: string;
  count: number;
  totalDiscount: number;
};

export type DiscountReportResult = {
  rows: DiscountReportItemRow[];
  grandTotal: number;
};

export async function getDiscountReport(params: {
  academicYearId: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
}): Promise<DiscountReportResult> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("payment_discounts")
    .select(
      "amount, fee_item_id, fee_items ( name ), payments!inner ( status, academic_year_id, paid_at )",
    )
    .eq("payments.status", "active")
    .eq("payments.academic_year_id", params.academicYearId)
    .gte("payments.paid_at", `${params.dateFrom}T00:00:00+07:00`)
    .lte("payments.paid_at", `${params.dateTo}T23:59:59+07:00`);

  type Row = {
    amount: string;
    fee_item_id: string;
    fee_items: { name: string } | null;
  };

  const byItem = new Map<string, DiscountReportItemRow>();
  let grandTotal = 0;

  for (const r of (data ?? []) as unknown as Row[]) {
    const amount = Number(r.amount);
    grandTotal += amount;
    const existing = byItem.get(r.fee_item_id);
    if (existing) {
      existing.count += 1;
      existing.totalDiscount = Math.round((existing.totalDiscount + amount) * 100) / 100;
    } else {
      byItem.set(r.fee_item_id, {
        feeItemId: r.fee_item_id,
        feeItemName: r.fee_items?.name ?? "—",
        count: 1,
        totalDiscount: amount,
      });
    }
  }

  return {
    rows: [...byItem.values()].sort((a, b) => b.totalDiscount - a.totalDiscount),
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}
```

- [ ] **Step 2: Write the panel (client)**

`src/components/finance/discount-report-panel.tsx` — model it on `daily-revenue-panel.tsx` (date-range toolbar + table). It calls the server function through a thin client query; since `getDiscountReport` is server-only, add a small server action wrapper OR a client query in `src/lib/queries/reports.ts` that queries `payment_discounts` directly with the browser client (mirror the existing `fetchDailyRevenue` browser-client pattern). Use the browser-client query approach for consistency:

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBaht } from "@/lib/format";
import { fetchDiscountReport } from "@/lib/queries/reports";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DiscountReportPanel() {
  useRequireRole(["admin", "finance"]);
  const { ctx } = useSemesterContext();
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());

  const { data, isLoading } = useQuery({
    queryKey: ["discount-report", ctx?.academicYearId, dateFrom, dateTo],
    queryFn: () => fetchDiscountReport({ academicYearId: ctx!.academicYearId, dateFrom, dateTo }),
    enabled: !!ctx,
  });

  const rows = data?.rows ?? [];
  const grandTotal = data?.grandTotal ?? 0;

  return (
    <>
      <AppHeader title="รายงานส่วนลด" basePath="/reports/discounts" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead
          title="รายงานส่วนลด"
          yearName={ctx?.academicYearName}
          semesterNumber={ctx?.semesterNumber}
          subtitle={`ช่วงวันที่ ${dateFrom} ถึง ${dateTo}`}
        />
        <div className="space-y-4">
          <div className="report-toolbar flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">ตั้งแต่</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ถึง</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
            </div>
            <div className="ml-auto">
              <ReportToolbar />
            </div>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีส่วนลดในช่วงที่เลือก</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รายการค่าใช้จ่าย</TableHead>
                  <TableHead className="text-right">จำนวนครั้ง</TableHead>
                  <TableHead className="text-right">ยอดส่วนลดรวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.feeItemId}>
                    <TableCell className="font-medium">{row.feeItemName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(row.totalDiscount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>รวมทั้งช่วง</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{formatBaht(grandTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Add the browser-client query**

In `src/lib/queries/reports.ts`, add a `fetchDiscountReport` that queries `payment_discounts` with the browser client (mirror `getDiscountReport`'s shape, using `createClient` from `@/lib/supabase/client`). Export the `DiscountReportItemRow`/`DiscountReportResult` types (or import from `@/lib/data/discount-report`):

```ts
import { createClient } from "@/lib/supabase/client";

export type DiscountReportItemRow = {
  feeItemId: string;
  feeItemName: string;
  count: number;
  totalDiscount: number;
};
export type DiscountReportResult = { rows: DiscountReportItemRow[]; grandTotal: number };

export async function fetchDiscountReport(params: {
  academicYearId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<DiscountReportResult> {
  const supabase = createClient();
  const { data } = await supabase
    .from("payment_discounts")
    .select("amount, fee_item_id, fee_items ( name ), payments!inner ( status, academic_year_id, paid_at )")
    .eq("payments.status", "active")
    .eq("payments.academic_year_id", params.academicYearId)
    .gte("payments.paid_at", `${params.dateFrom}T00:00:00+07:00`)
    .lte("payments.paid_at", `${params.dateTo}T23:59:59+07:00`);

  type Row = { amount: string; fee_item_id: string; fee_items: { name: string } | null };
  const byItem = new Map<string, DiscountReportItemRow>();
  let grandTotal = 0;
  for (const r of (data ?? []) as unknown as Row[]) {
    const amount = Number(r.amount);
    grandTotal += amount;
    const e = byItem.get(r.fee_item_id);
    if (e) {
      e.count += 1;
      e.totalDiscount = Math.round((e.totalDiscount + amount) * 100) / 100;
    } else {
      byItem.set(r.fee_item_id, { feeItemId: r.fee_item_id, feeItemName: r.fee_items?.name ?? "—", count: 1, totalDiscount: amount });
    }
  }
  return { rows: [...byItem.values()].sort((a, b) => b.totalDiscount - a.totalDiscount), grandTotal: Math.round(grandTotal * 100) / 100 };
}
```

(`src/lib/data/discount-report.ts` from Step 1 remains available for any server-side/SSR use; the panel uses the browser-client `fetchDiscountReport`.)

- [ ] **Step 4: Add the route**

`src/app/(dashboard)/reports/discounts/page.tsx`:

```tsx
import { DiscountReportPanel } from "@/components/finance/discount-report-panel";

export default function DiscountReportPage() {
  return <DiscountReportPanel />;
}
```

- [ ] **Step 5: Add the nav link**

In `src/components/app-sidebar.tsx`, add to the admin/finance nav array (after the `/reports/daily` entry, line 33):

```tsx
  { href: "/reports/discounts", label: "รายงานส่วนลด", icon: ChartColumn },
```

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`. Visit `/reports/discounts`. With the Task 4 discounted payment present and today's date in range, confirm one row (ค่าเล่าเรียน · 1 · ฿500.00) and grand total ฿500.00.

- [ ] **Step 7: Typecheck + lint + commit**

```bash
npx tsc --noEmit && npx eslint src/components/finance/discount-report-panel.tsx src/lib/queries/reports.ts
git add src/lib/data/discount-report.ts src/components/finance/discount-report-panel.tsx "src/app/(dashboard)/reports/discounts/page.tsx" src/lib/queries/reports.ts src/components/app-sidebar.tsx
git commit -m "feat(finance): discount summary report"
```

---

## Task 12: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Typecheck + lint the project**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: End-to-end manual pass**

Run: `npm run dev`. Verify the full loop:
1. Generate/confirm an invoice issues at full amount (no discount UI on the invoices page).
2. Record a payment with discounts on two lines (one บาท, one %). Amount locks to net due.
3. Receipt shows full lines + รวม + two ส่วนลด rows + รวมสุทธิ.
4. `/reports/discounts` reflects both discounts.
5. Void the payment → invoice returns to full outstanding, unpaid.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "test(finance): verify payment-time discount end to end"
```
