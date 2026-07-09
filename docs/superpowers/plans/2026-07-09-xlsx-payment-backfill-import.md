# XLSX Historical Payment Backfill Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let finance staff import historical payments directly from their native per-classroom XLSX sheets (tuition + insurance columns, `-` for n/a, negative numbers for discounts/write-offs), validating every row against real invoices already in the system before writing anything.

**Architecture:** A pure-function parsing/validation layer (`src/lib/finance/xlsx-import.ts`) turns raw sheet rows into up-to-two "groups" per row (tuition invoice, insurance invoice) and validates each against the student's actual invoices fetched from the DB. Two Postgres RPCs handle the two possible outcomes per group: `record_backfill_payment` (extended to optionally apply a discount to the invoice it's paying) when there's cash collected, and a new `record_backfill_invoice_discount` RPC when a group is a pure 100%-or-partial write-off with zero cash (no payment/receipt is ever created for ฿0 collected — see design spec for the accounting rationale). A new dialog component drives the file upload, preview, and confirm flow, reusing the existing CSV import dialog's visual patterns.

**Tech Stack:** Next.js server actions, Supabase Postgres RPCs (plpgsql), `xlsx` (SheetJS) for parsing in the browser, Vitest for unit tests.

**Spec:** [docs/superpowers/specs/2026-07-09-xlsx-payment-backfill-import-design.md](../specs/2026-07-09-xlsx-payment-backfill-import-design.md)

---

## File Structure

- Create: `supabase/migrations/20260710000000_backfill_payment_discount.sql` — extends `record_backfill_payment` with optional discount params
- Create: `supabase/migrations/20260710000100_invoice_discount_log.sql` — new `invoice_discount_log` table + `record_backfill_invoice_discount` RPC
- Create: `src/lib/finance/xlsx-import.ts` — pure parsing (workbook → rows) + grouping + validation functions
- Create: `src/lib/finance/xlsx-import.test.ts` — unit tests for the above
- Modify: `src/lib/actions/payments.ts` — add `getXlsxImportPreviewAction` and `importPaymentsXlsxBackfill`
- Create: `src/components/finance/xlsx-payment-import-dialog.tsx` — new dialog UI (separate file from the CSV dialog; different preview shape — groups, not rows)
- Modify: `src/components/finance/payments-panel.tsx` — add a second "นำเข้า XLSX" button + wire the new dialog
- Modify: `package.json` — add `xlsx` dependency

---

## Task 1: Extend `record_backfill_payment` to optionally apply a discount

**Files:**
- Create: `supabase/migrations/20260710000000_backfill_payment_discount.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Extend record_backfill_payment so a single historical-payment RPC call can
-- also apply a discount to the invoice it's paying (used by the XLSX import:
-- a row can be partly cash, partly a write-off against the SAME invoice —
-- e.g. เอกสาร 400 collected, ค่าประกัน -200 discounted, on one invoice).
--
-- The two new params are optional (DEFAULT NULL) so existing callers
-- (CSV backfill import) are unaffected.

CREATE OR REPLACE FUNCTION public.record_backfill_payment(
  p_student_id uuid,
  p_academic_year_id uuid,
  p_academic_year_name text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_recorded_by uuid,
  p_note text,
  p_invoice_type_id uuid,
  p_snapshot jsonb,
  p_allocations jsonb,
  p_discount_invoice_id uuid DEFAULT NULL,
  p_discount_value numeric DEFAULT NULL
)
RETURNS TABLE (payment_id uuid, receipt_number text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_seq int;
  v_receipt text;
  v_payment_id uuid;
  v_alloc_total numeric;
  v_alloc jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric;
  v_paid_amount numeric;
  v_total_amount numeric;
  v_invoice_student uuid;
  v_new_paid numeric;
  v_status public.invoice_status;
BEGIN
  IF NOT (public.is_admin() OR public.is_finance()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(coalesce(p_allocations, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_allocations must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum((a->>'amount')::numeric), 0)
    INTO v_alloc_total
    FROM jsonb_array_elements(p_allocations) AS a;
  IF round(v_alloc_total, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'allocations must sum to p_amount' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_academic_year_id::text, 0));

  -- Apply the discount (if any) BEFORE the allocation loop below re-reads
  -- total_amount, so the overpay/status derivation sees the post-discount total.
  IF p_discount_invoice_id IS NOT NULL AND p_discount_value IS NOT NULL AND p_discount_value > 0 THEN
    UPDATE public.student_invoices
       SET discount_type = 'fixed',
           discount_value = p_discount_value,
           total_amount = GREATEST(subtotal - p_discount_value, 0)
     WHERE id = p_discount_invoice_id
       AND student_id = p_student_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'discount invoice not found or does not belong to student' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT coalesce(max((split_part(p.receipt_number, '/', 2))::int), 0) + 1
    INTO v_seq
    FROM public.payments p
   WHERE p.academic_year_id = p_academic_year_id;

  v_receipt := p_academic_year_name || '/' || lpad(v_seq::text, 5, '0');

  INSERT INTO public.payments (
    receipt_number, student_id, academic_year_id, amount,
    payment_method, transfer_reference, paid_at, recorded_by, note, status
  )
  VALUES (
    v_receipt, p_student_id, p_academic_year_id, p_amount,
    'cash', NULL, p_paid_at, p_recorded_by, p_note, 'active'
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.receipts (payment_id, receipt_number, invoice_type_id, snapshot_data)
  VALUES (
    v_payment_id,
    v_receipt,
    p_invoice_type_id,
    p_snapshot || jsonb_build_object('receiptNumber', v_receipt)
  );

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_invoice_id := (v_alloc->>'invoiceId')::uuid;
    v_alloc_amount := (v_alloc->>'amount')::numeric;

    IF v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'allocation amount must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT student_id, paid_amount, total_amount
      INTO v_invoice_student, v_paid_amount, v_total_amount
      FROM public.student_invoices
     WHERE id = v_invoice_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_invoice_student <> p_student_id THEN
      RAISE EXCEPTION 'invoice does not belong to student' USING ERRCODE = '22023';
    END IF;

    v_new_paid := round(v_paid_amount + v_alloc_amount, 2);
    IF v_new_paid > round(v_total_amount, 2) THEN
      RAISE EXCEPTION 'allocation would overpay invoice' USING ERRCODE = '22023';
    END IF;

    v_status := CASE
      WHEN v_new_paid <= 0 THEN 'unpaid'
      WHEN v_new_paid < v_total_amount THEN 'partial'
      ELSE 'paid'
    END;

    INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
    VALUES (v_payment_id, v_invoice_id, v_alloc_amount);

    UPDATE public.student_invoices
       SET paid_amount = v_new_paid,
           status = v_status
     WHERE id = v_invoice_id;
  END LOOP;

  RETURN QUERY SELECT v_payment_id, v_receipt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_backfill_payment(
  uuid, uuid, text, numeric, timestamptz, uuid, text, uuid, jsonb, jsonb, uuid, numeric
) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or the project's existing migration-apply command — check [supabase-migration-connectivity memory] if this hangs; use the IPv4 session pooler, not the direct host)
Expected: migration applies with no error; `record_backfill_payment` now has 12 params.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260710000000_backfill_payment_discount.sql
git commit -m "feat(db): let record_backfill_payment apply an invoice discount"
```

---

## Task 2: New `invoice_discount_log` table + `record_backfill_invoice_discount` RPC

**Files:**
- Create: `supabase/migrations/20260710000100_invoice_discount_log.sql`

- [ ] **Step 1: Write the migration**

```sql
-- A fully-written-off historical invoice (e.g. insurance fee waived via a
-- "-200" cell in the XLSX import) gets no payment/receipt — a receipt means
-- cash was received, and payments.amount must be > 0 (payments_amount_positive).
-- This table is the only record of *why* such an invoice reads "paid" with
-- ฿0 collected, since student_invoices itself has no note/reason field.
CREATE TABLE public.invoice_discount_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.student_invoices (id) ON DELETE RESTRICT,
  discount_value numeric(12, 2) NOT NULL,
  note text,
  recorded_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_discount_log_value_positive CHECK (discount_value > 0)
);

CREATE INDEX idx_invoice_discount_log_invoice_id ON public.invoice_discount_log (invoice_id);

ALTER TABLE public.invoice_discount_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_discount_log_admin_all ON public.invoice_discount_log
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY invoice_discount_log_finance_all ON public.invoice_discount_log
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

-- Writes off an invoice with zero cash collected: sets a fixed discount that
-- brings total_amount to (subtotal - discount_value), marks the invoice paid
-- at paid_amount = 0 (student_invoices.status logic already treats
-- paid_amount >= total_amount as 'paid'; 0 >= 0 holds when fully written off),
-- and logs why. No payments/receipts row is created — see file header above.
CREATE OR REPLACE FUNCTION public.record_backfill_invoice_discount(
  p_invoice_id uuid,
  p_discount_value numeric,
  p_note text,
  p_recorded_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric;
  v_paid_amount numeric;
  v_new_total numeric;
  v_status public.invoice_status;
BEGIN
  IF NOT (public.is_admin() OR public.is_finance()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'p_discount_value must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT subtotal, paid_amount
    INTO v_subtotal, v_paid_amount
    FROM public.student_invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
  END IF;

  v_new_total := GREATEST(v_subtotal - p_discount_value, 0);
  v_status := CASE
    WHEN v_paid_amount <= 0 AND v_new_total <= 0 THEN 'paid'
    WHEN v_paid_amount <= 0 THEN 'unpaid'
    WHEN v_paid_amount < v_new_total THEN 'partial'
    ELSE 'paid'
  END;

  UPDATE public.student_invoices
     SET discount_type = 'fixed',
         discount_value = p_discount_value,
         total_amount = v_new_total,
         status = v_status
   WHERE id = p_invoice_id;

  INSERT INTO public.invoice_discount_log (invoice_id, discount_value, note, recorded_by)
  VALUES (p_invoice_id, p_discount_value, p_note, p_recorded_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_backfill_invoice_discount(
  uuid, numeric, text, uuid
) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: migration applies with no error; `invoice_discount_log` table exists; `record_backfill_invoice_discount` callable.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260710000100_invoice_discount_log.sql
git commit -m "feat(db): add invoice_discount_log table and write-off RPC"
```

---

## Task 3: Add the `xlsx` parsing dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run: `npm install xlsx`
Expected: `package.json` and `package-lock.json` gain `xlsx` (SheetJS) as a dependency.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add xlsx dependency for payment backfill import"
```

---

## Task 4: Parsing module — workbook rows → import groups

**Files:**
- Create: `src/lib/finance/xlsx-import.ts`
- Test: `src/lib/finance/xlsx-import.test.ts`

This task covers `parseXlsxWorkbook` (raw cells → typed rows) and `buildImportGroups` (row → up to 2 groups). Both are pure functions, independently testable without touching the DB.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/finance/xlsx-import.test.ts
import { describe, expect, it } from "vitest";
import { buildImportGroups, type XlsxSheetRow } from "@/lib/finance/xlsx-import";

function makeRow(overrides: Partial<XlsxSheetRow> = {}): XlsxSheetRow {
  return {
    rowNumber: 4,
    studentCode: "13777",
    studentName: "ศิริลัดดา คชรินทร์",
    reimbursableAmount: null,
    nonReimbursableAmount: 2000,
    lunchAmount: null,
    documentAmount: 400,
    insuranceAmount: -200,
    foreignTeacherAmount: 500,
    tuitionVoucher: "53-2606",
    insuranceVoucher: null,
    paidDateIso: "2026-05-05",
    ...overrides,
  };
}

describe("buildImportGroups", () => {
  it("splits a row into a tuition group and an insurance group", () => {
    const groups = buildImportGroups(makeRow());
    expect(groups).toHaveLength(2);

    const tuition = groups.find((g) => g.kind === "tuition")!;
    expect(tuition.netCash).toBe(2900);
    expect(tuition.discount).toBe(0);
    expect(tuition.groupTotal).toBe(2900);
    expect(tuition.expectedIsReimbursable).toBe(false);
    expect(tuition.voucher).toBe("53-2606");

    const insurance = groups.find((g) => g.kind === "insurance")!;
    expect(insurance.netCash).toBe(0);
    expect(insurance.discount).toBe(200);
    expect(insurance.groupTotal).toBe(200);
  });

  it("omits the insurance group when insuranceAmount is null", () => {
    const groups = buildImportGroups(makeRow({ insuranceAmount: null }));
    expect(groups.map((g) => g.kind)).toEqual(["tuition"]);
  });

  it("omits the tuition group when all tuition-composing cells are null", () => {
    const groups = buildImportGroups(
      makeRow({
        nonReimbursableAmount: null,
        reimbursableAmount: null,
        lunchAmount: null,
        documentAmount: null,
        foreignTeacherAmount: null,
      }),
    );
    expect(groups.map((g) => g.kind)).toEqual(["insurance"]);
  });

  it("sets expectedIsReimbursable true when เบิกได้ is populated", () => {
    const groups = buildImportGroups(
      makeRow({ reimbursableAmount: 2900, nonReimbursableAmount: null }),
    );
    const tuition = groups.find((g) => g.kind === "tuition")!;
    expect(tuition.expectedIsReimbursable).toBe(true);
  });

  it("handles a partial discount mixed with cash in the same group", () => {
    const groups = buildImportGroups(
      makeRow({ nonReimbursableAmount: 1800, documentAmount: -100 }),
    );
    const tuition = groups.find((g) => g.kind === "tuition")!;
    // 1800 (cash) + 500 (foreignTeacher, from base fixture) = 2300 net cash
    expect(tuition.netCash).toBe(2300);
    expect(tuition.discount).toBe(100);
    expect(tuition.groupTotal).toBe(2400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/finance/xlsx-import.test.ts`
Expected: FAIL — `Cannot find module '@/lib/finance/xlsx-import'` (file doesn't exist yet).

- [ ] **Step 3: Write `parseXlsxWorkbook` and `buildImportGroups`**

```ts
// src/lib/finance/xlsx-import.ts
import * as XLSX from "xlsx";

export type XlsxSheetRow = {
  rowNumber: number;
  studentCode: string;
  studentName: string;
  reimbursableAmount: number | null; // เบิกได้
  nonReimbursableAmount: number | null; // เบิกไม่ได้
  lunchAmount: number | null; // ค่าอาหารกลางวัน
  documentAmount: number | null; // ค่าเอกสารประกอบการเรียนและวัดผล
  insuranceAmount: number | null; // ค่าประกัน
  foreignTeacherAmount: number | null; // ค่าครูสอนภาษาต่างประเทศ
  tuitionVoucher: string | null; // first ใบสำคัญ
  insuranceVoucher: string | null; // second ใบสำคัญ
  paidDateIso: string | null; // "YYYY-MM-DD"
};

/** Reads the staff's per-classroom sheet: row 1 = class label, row 3 = headers, row 4+ = data. */
export function parseXlsxWorkbook(buffer: ArrayBuffer): XlsxSheetRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const rows: XlsxSheetRow[] = [];
  for (let i = 3; i < raw.length; i++) {
    const cells = raw[i];
    if (!cells || cells.every((c) => c === null || c === "")) continue;

    const studentCode = String(cells[1] ?? "").trim();
    if (!studentCode) continue;

    const firstName = String(cells[2] ?? "").trim();
    const lastName = String(cells[3] ?? "").trim();

    rows.push({
      rowNumber: i + 1,
      studentCode,
      studentName: `${firstName} ${lastName}`.trim(),
      reimbursableAmount: parseCellAmount(cells[4]),
      nonReimbursableAmount: parseCellAmount(cells[6]),
      lunchAmount: parseCellAmount(cells[7]),
      documentAmount: parseCellAmount(cells[8]),
      insuranceAmount: parseCellAmount(cells[9]),
      foreignTeacherAmount: parseCellAmount(cells[10]),
      tuitionVoucher: parseCellText(cells[5]),
      insuranceVoucher: parseCellText(cells[11]),
      paidDateIso: parseCellDate(cells[12]),
    });
  }
  return rows;
}

function parseCellAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "-" || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCellText(value: unknown): string | null {
  if (value === null || value === undefined || value === "-" || value === "") return null;
  return String(value).trim();
}

function parseCellDate(value: unknown): string | null {
  if (!(value instanceof Date)) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type ImportGroupKind = "tuition" | "insurance";

export type ImportGroup = {
  rowNumber: number;
  kind: ImportGroupKind;
  studentCode: string;
  studentName: string;
  /** Only meaningful for "tuition" groups; null means neither เบิกได้/เบิกไม่ได้ was populated. */
  expectedIsReimbursable: boolean | null;
  /** Sum of positive cell values in this group — actual cash collected. */
  netCash: number;
  /** Sum of |negative cell values| in this group — amount written off. */
  discount: number;
  /** netCash + discount — must equal the matched invoice's gross total_amount. */
  groupTotal: number;
  voucher: string | null;
  paidDateIso: string | null;
};

/** Splits one sheet row into up to 2 independent import groups (tuition, insurance). */
export function buildImportGroups(row: XlsxSheetRow): ImportGroup[] {
  const groups: ImportGroup[] = [];

  const tuitionCells = [
    row.reimbursableAmount,
    row.nonReimbursableAmount,
    row.lunchAmount,
    row.documentAmount,
    row.foreignTeacherAmount,
  ].filter((v): v is number => v !== null);

  if (tuitionCells.length > 0) {
    const netCash = round2(tuitionCells.filter((v) => v > 0).reduce((s, v) => s + v, 0));
    const discount = round2(
      tuitionCells.filter((v) => v < 0).reduce((s, v) => s - v, 0),
    );
    groups.push({
      rowNumber: row.rowNumber,
      kind: "tuition",
      studentCode: row.studentCode,
      studentName: row.studentName,
      expectedIsReimbursable:
        row.reimbursableAmount !== null
          ? true
          : row.nonReimbursableAmount !== null
            ? false
            : null,
      netCash,
      discount,
      groupTotal: round2(netCash + discount),
      voucher: row.tuitionVoucher,
      paidDateIso: row.paidDateIso,
    });
  }

  if (row.insuranceAmount !== null) {
    const netCash = row.insuranceAmount > 0 ? round2(row.insuranceAmount) : 0;
    const discount = row.insuranceAmount < 0 ? round2(-row.insuranceAmount) : 0;
    groups.push({
      rowNumber: row.rowNumber,
      kind: "insurance",
      studentCode: row.studentCode,
      studentName: row.studentName,
      expectedIsReimbursable: null,
      netCash,
      discount,
      groupTotal: round2(netCash + discount),
      voucher: row.insuranceVoucher,
      paidDateIso: row.paidDateIso,
    });
  }

  return groups;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/finance/xlsx-import.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/xlsx-import.ts src/lib/finance/xlsx-import.test.ts
git commit -m "feat(finance): parse xlsx backfill sheets into import groups"
```

---

## Task 5: Validation — matching each group to a real invoice

**Files:**
- Modify: `src/lib/finance/xlsx-import.ts`
- Modify: `src/lib/finance/xlsx-import.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/finance/xlsx-import.test.ts`:

```ts
import { buildImportGroups, validateGroup, type InvoiceCandidate, type XlsxSheetRow } from "@/lib/finance/xlsx-import";

// ... (keep existing imports/tests above, add this describe block)

describe("validateGroup", () => {
  const tuitionGroup = buildImportGroups(makeRow())[0]; // kind: "tuition", groupTotal 2900, expectedIsReimbursable false
  const insuranceGroup = buildImportGroups(makeRow())[1]; // kind: "insurance", groupTotal 200

  const tuitionInvoice: InvoiceCandidate = {
    id: "inv-tuition",
    isReimbursable: false,
    totalAmount: 2900,
    status: "unpaid",
    feeItemNames: ["ค่าธรรมเนียมการศึกษา", "ค่าอาหารกลางวัน"],
  };
  const insuranceInvoice: InvoiceCandidate = {
    id: "inv-insurance",
    isReimbursable: false,
    totalAmount: 200,
    status: "unpaid",
    feeItemNames: ["ค่าประกันอุบัติเหตุ"],
  };

  it("matches a tuition group to the non-insurance invoice", () => {
    const result = validateGroup(tuitionGroup, [tuitionInvoice, insuranceInvoice]);
    expect(result).toEqual({ ok: true, invoiceId: "inv-tuition" });
  });

  it("matches an insurance group to the invoice whose fee item name contains ประกัน", () => {
    const result = validateGroup(insuranceGroup, [tuitionInvoice, insuranceInvoice]);
    expect(result).toEqual({ ok: true, invoiceId: "inv-insurance" });
  });

  it("rejects when no matching invoice exists", () => {
    const result = validateGroup(insuranceGroup, [tuitionInvoice]);
    expect(result).toEqual({ ok: false, reason: "ไม่พบใบแจ้งหนี้ที่ตรงกัน" });
  });

  it("rejects when more than one candidate invoice matches", () => {
    const result = validateGroup(tuitionGroup, [
      tuitionInvoice,
      { ...tuitionInvoice, id: "inv-tuition-2" },
    ]);
    expect(result).toEqual({ ok: false, reason: "พบใบแจ้งหนี้มากกว่า 1 ใบ" });
  });

  it("rejects when the invoice is already paid", () => {
    const result = validateGroup(tuitionGroup, [
      { ...tuitionInvoice, status: "paid" },
      insuranceInvoice,
    ]);
    expect(result).toEqual({ ok: false, reason: "ใบแจ้งหนี้นี้ชำระแล้ว" });
  });

  it("rejects when เบิกได้/เบิกไม่ได้ doesn't match the invoice's is_reimbursable", () => {
    const result = validateGroup(tuitionGroup, [
      { ...tuitionInvoice, isReimbursable: true },
      insuranceInvoice,
    ]);
    expect(result).toEqual({
      ok: false,
      reason: "สถานะเบิกได้/เบิกไม่ได้ไม่ตรงกับใบแจ้งหนี้",
    });
  });

  it("rejects when groupTotal doesn't match the invoice's total_amount", () => {
    const result = validateGroup(tuitionGroup, [
      { ...tuitionInvoice, totalAmount: 3000 },
      insuranceInvoice,
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ยอดรวมไม่ตรงกับใบแจ้งหนี้");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/finance/xlsx-import.test.ts`
Expected: FAIL — `validateGroup` / `InvoiceCandidate` not exported.

- [ ] **Step 3: Add `validateGroup` and `InvoiceCandidate` to `xlsx-import.ts`**

Append to `src/lib/finance/xlsx-import.ts`:

```ts
export type InvoiceCandidate = {
  id: string;
  isReimbursable: boolean;
  totalAmount: number;
  status: "unpaid" | "partial" | "paid";
  /** fee_items.name for every invoice_lines row on this invoice. */
  feeItemNames: string[];
};

export type GroupValidationResult =
  | { ok: true; invoiceId: string }
  | { ok: false; reason: string };

const AMOUNT_EPSILON = 0.005;

/** Matches one import group against a student's invoice candidates and checks it's safe to import. */
export function validateGroup(
  group: ImportGroup,
  invoices: InvoiceCandidate[],
): GroupValidationResult {
  const isInsuranceInvoice = (inv: InvoiceCandidate) =>
    inv.feeItemNames.some((name) => name.includes("ประกัน"));

  const candidates =
    group.kind === "insurance"
      ? invoices.filter(isInsuranceInvoice)
      : invoices.filter((inv) => !isInsuranceInvoice(inv));

  if (candidates.length === 0) {
    return { ok: false, reason: "ไม่พบใบแจ้งหนี้ที่ตรงกัน" };
  }
  if (candidates.length > 1) {
    return { ok: false, reason: "พบใบแจ้งหนี้มากกว่า 1 ใบ" };
  }

  const invoice = candidates[0];

  if (invoice.status === "paid") {
    return { ok: false, reason: "ใบแจ้งหนี้นี้ชำระแล้ว" };
  }

  if (
    group.kind === "tuition" &&
    group.expectedIsReimbursable !== null &&
    invoice.isReimbursable !== group.expectedIsReimbursable
  ) {
    return { ok: false, reason: "สถานะเบิกได้/เบิกไม่ได้ไม่ตรงกับใบแจ้งหนี้" };
  }

  if (Math.abs(group.groupTotal - invoice.totalAmount) > AMOUNT_EPSILON) {
    return {
      ok: false,
      reason: `ยอดรวมไม่ตรงกับใบแจ้งหนี้ (ไฟล์ ${group.groupTotal} ≠ ระบบ ${invoice.totalAmount})`,
    };
  }

  return { ok: true, invoiceId: invoice.id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/finance/xlsx-import.test.ts`
Expected: PASS (12 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/xlsx-import.ts src/lib/finance/xlsx-import.test.ts
git commit -m "feat(finance): validate xlsx import groups against real invoices"
```

---

## Task 6: Server actions — preview and import

**Files:**
- Modify: `src/lib/actions/payments.ts`

- [ ] **Step 1: Add `getXlsxImportPreviewAction`**

Add near the existing `getImportPreviewDataAction` in `src/lib/actions/payments.ts`:

```ts
import type { InvoiceCandidate } from "@/lib/finance/xlsx-import";

export type XlsxImportPreviewStudent = {
  studentCode: string;
  studentId: string;
  name: string;
  invoices: InvoiceCandidate[];
};

export async function getXlsxImportPreviewAction(
  studentCodes: string[],
  semesterId: string,
) {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const codes = [...new Set(studentCodes.map((c) => c.trim()).filter(Boolean))];
  if (codes.length === 0) {
    return { ok: true as const, students: [] as XlsxImportPreviewStudent[] };
  }

  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .in("student_code", codes);

  const studentRows = students ?? [];
  const studentIds = studentRows.map((s) => s.id);

  type InvoiceRow = {
    id: string;
    student_id: string;
    total_amount: number;
    status: "unpaid" | "partial" | "paid";
    is_reimbursable: boolean;
    invoice_lines: { fee_items: { name: string } | null }[] | null;
  };

  const invoicesByStudent = new Map<string, InvoiceCandidate[]>();
  if (studentIds.length > 0) {
    const { data: invoices } = await supabase
      .from("student_invoices")
      .select(
        "id, student_id, total_amount, status, is_reimbursable, invoice_lines(fee_items(name))",
      )
      .in("student_id", studentIds)
      .eq("semester_id", semesterId) as unknown as { data: InvoiceRow[] | null };

    for (const inv of invoices ?? []) {
      const candidate: InvoiceCandidate = {
        id: inv.id,
        isReimbursable: inv.is_reimbursable,
        totalAmount: Number(inv.total_amount),
        status: inv.status,
        feeItemNames: (inv.invoice_lines ?? [])
          .map((l) => l.fee_items?.name)
          .filter((n): n is string => Boolean(n)),
      };
      const list = invoicesByStudent.get(inv.student_id) ?? [];
      list.push(candidate);
      invoicesByStudent.set(inv.student_id, list);
    }
  }

  const result: XlsxImportPreviewStudent[] = studentRows.map((s) => ({
    studentCode: s.student_code,
    studentId: s.id,
    name: formatStudentName(s.first_name, s.last_name),
    invoices: invoicesByStudent.get(s.id) ?? [],
  }));

  return { ok: true as const, students: result };
}
```

- [ ] **Step 2: Add `importPaymentsXlsxBackfill`**

Add after `importPaymentsBackfill` in `src/lib/actions/payments.ts`:

```ts
export type XlsxImportGroupInput = {
  rowNumber: number;
  kind: "tuition" | "insurance";
  invoiceId: string;
  studentId: string;
  studentCode: string;
  netCash: number;
  discount: number;
  voucher: string | null;
  paidDateIso: string;
};

export type XlsxImportResult = {
  ok: true;
  imported: number;
  failed: { rowNumber: number; studentCode: string; reason: string }[];
};

export async function importPaymentsXlsxBackfill(input: {
  groups: XlsxImportGroupInput[];
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
}): Promise<XlsxImportResult | { ok: false; error: string }> {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const groups = [...input.groups].sort((a, b) =>
    a.paidDateIso.localeCompare(b.paidDateIso),
  );

  const [invoiceTypeId, gradeByStudent] = await Promise.all([
    getDefaultInvoiceTypeId(),
    getStudentGradeMap(input.semesterId),
  ]);
  if (!invoiceTypeId) return { ok: false, error: "ไม่พบประเภทใบแจ้งเริ่มต้น" };

  const failed: XlsxImportResult["failed"] = [];
  let imported = 0;

  for (const group of groups) {
    const paidAt = `${group.paidDateIso}T12:00:00+07:00`;
    const gradeClassroom = gradeByStudent.get(group.studentId) ?? "—";

    const { data: invoiceRow } = await supabase
      .from("student_invoices")
      .select("invoice_type_id, invoice_types(name)")
      .eq("id", group.invoiceId)
      .maybeSingle() as unknown as {
        data: { invoice_type_id: string; invoice_types: { name: string } | null } | null;
      };

    if (!invoiceRow) {
      failed.push({ rowNumber: group.rowNumber, studentCode: group.studentCode, reason: "ไม่พบใบแจ้งหนี้" });
      continue;
    }

    if (group.netCash > 0) {
      const { data: student } = await supabase
        .from("students")
        .select("student_code, first_name, last_name")
        .eq("id", group.studentId)
        .maybeSingle();
      if (!student) {
        failed.push({ rowNumber: group.rowNumber, studentCode: group.studentCode, reason: "ไม่พบนักเรียน" });
        continue;
      }

      const snapshot: Record<string, unknown> = {
        receiptNumber: "",
        paidAt,
        studentCode: student.student_code,
        studentName: formatStudentName(student.first_name, student.last_name),
        gradeClassroom,
        paymentMethod: "cash",
        transferReference: null,
        amount: group.netCash,
        allocations: [
          {
            invoiceId: group.invoiceId,
            invoiceName: invoiceRow.invoice_types?.name ?? "—",
            amount: group.netCash,
          },
        ],
        recordedBy: auth.profile.display_name ?? "เจ้าหน้าที่",
      };

      const { error: rpcError } = await supabase.rpc("record_backfill_payment", {
        p_student_id: group.studentId,
        p_academic_year_id: input.academicYearId,
        p_academic_year_name: input.academicYearName,
        p_amount: group.netCash,
        p_paid_at: paidAt,
        p_recorded_by: auth.profile.id,
        p_note: group.voucher,
        p_invoice_type_id: invoiceRow.invoice_type_id ?? invoiceTypeId,
        p_snapshot: snapshot,
        p_allocations: [{ invoiceId: group.invoiceId, amount: group.netCash }],
        p_discount_invoice_id: group.discount > 0 ? group.invoiceId : null,
        p_discount_value: group.discount > 0 ? group.discount : null,
      });

      if (rpcError) {
        failed.push({ rowNumber: group.rowNumber, studentCode: group.studentCode, reason: "บันทึกการชำระไม่ได้" });
        continue;
      }
    } else {
      const { error: rpcError } = await supabase.rpc("record_backfill_invoice_discount", {
        p_invoice_id: group.invoiceId,
        p_discount_value: group.discount,
        p_note: group.voucher,
        p_recorded_by: auth.profile.id,
      });

      if (rpcError) {
        failed.push({ rowNumber: group.rowNumber, studentCode: group.studentCode, reason: "บันทึกส่วนลดไม่ได้" });
        continue;
      }
    }

    imported += 1;
  }

  revalidateFinancePaths();

  return { ok: true, imported, failed };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (fix any import path mistakes before continuing — e.g. `getDefaultInvoiceTypeId`, `getStudentGradeMap`, `formatStudentName`, `createClient`, `requireFinanceAction` are already imported at the top of `payments.ts`; `InvoiceCandidate` needs the new import added in Step 1).

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat(finance): add xlsx backfill preview and import server actions"
```

---

## Task 7: UI — XLSX import dialog

**Files:**
- Create: `src/components/finance/xlsx-payment-import-dialog.tsx`
- Modify: `src/components/finance/payments-panel.tsx`

- [ ] **Step 1: Write the dialog component**

```tsx
// src/components/finance/xlsx-payment-import-dialog.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { formatBaht, formatThaiDate } from "@/lib/format";
import {
  buildImportGroups,
  parseXlsxWorkbook,
  validateGroup,
  type ImportGroup,
} from "@/lib/finance/xlsx-import";
import {
  getXlsxImportPreviewAction,
  importPaymentsXlsxBackfill,
  type XlsxImportGroupInput,
} from "@/lib/actions/payments";
import { cn } from "@/lib/utils";

type PreviewGroup = ImportGroup & {
  studentId: string | null;
  invoiceId: string | null;
  willImport: boolean;
  reason: string | null;
};

const KIND_LABEL: Record<ImportGroup["kind"], string> = {
  tuition: "ค่าธรรมเนียมการศึกษา",
  insurance: "ค่าประกันอุบัติเหตุ",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  onImported: () => void;
};

export function XlsxPaymentImportDialog({
  open,
  onOpenChange,
  academicYearId,
  academicYearName,
  semesterId,
  onImported,
}: Props) {
  const [groups, setGroups] = useState<PreviewGroup[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setGroups([]);
    setParsing(false);
    setSubmitting(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);

    const buffer = await file.arrayBuffer();
    const sheetRows = parseXlsxWorkbook(buffer);
    const rawGroups = sheetRows.flatMap(buildImportGroups);

    const codes = [...new Set(rawGroups.map((g) => g.studentCode))];
    const preview = await getXlsxImportPreviewAction(codes, semesterId);
    if (!preview.ok) {
      toast.error(preview.error);
      setParsing(false);
      return;
    }
    const byCode = new Map(preview.students.map((s) => [s.studentCode, s]));

    const assessed: PreviewGroup[] = rawGroups.map((group) => {
      const student = byCode.get(group.studentCode);
      if (!student) {
        return { ...group, studentId: null, invoiceId: null, willImport: false, reason: "ไม่พบรหัสนักเรียน" };
      }
      if (!group.paidDateIso) {
        return { ...group, studentId: student.studentId, invoiceId: null, willImport: false, reason: "วันที่ไม่ถูกต้อง" };
      }
      const result = validateGroup(group, student.invoices);
      if (!result.ok) {
        return { ...group, studentId: student.studentId, invoiceId: null, willImport: false, reason: result.reason };
      }
      return { ...group, studentId: student.studentId, invoiceId: result.invoiceId, willImport: true, reason: null };
    });

    setGroups(assessed);
    setParsing(false);
    e.target.value = "";
  }

  async function handleConfirm() {
    const importable: XlsxImportGroupInput[] = groups
      .filter((g) => g.willImport && g.studentId && g.invoiceId)
      .map((g) => ({
        rowNumber: g.rowNumber,
        kind: g.kind,
        invoiceId: g.invoiceId!,
        studentId: g.studentId!,
        studentCode: g.studentCode,
        netCash: g.netCash,
        discount: g.discount,
        voucher: g.voucher,
        paidDateIso: g.paidDateIso!,
      }));

    if (importable.length === 0) {
      toast.error("ไม่มีรายการที่นำเข้าได้");
      return;
    }

    setSubmitting(true);
    const result = await importPaymentsXlsxBackfill({
      groups: importable,
      academicYearId,
      academicYearName,
      semesterId,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(
      `นำเข้าสำเร็จ ${result.imported} รายการ${result.failed.length ? ` · ล้มเหลว ${result.failed.length}` : ""}`,
    );
    reset();
    onOpenChange(false);
    onImported();
  }

  const willImportCount = groups.filter((g) => g.willImport).length;
  const skipCount = groups.length - willImportCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>นำเข้าการชำระเงินจาก XLSX</DialogTitle>
          <DialogDescription>
            ไฟล์รูปแบบใบบันทึกการชำระรายห้อง (เบิกได้/เบิกไม่ได้/ค่าอาหารกลางวัน/ค่าเอกสารฯ/ค่าประกัน/ค่าครูต่างชาติ) — ใส่ตัวเลขติดลบสำหรับส่วนลด เช่น -200
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            disabled={parsing || submitting}
          />
        </div>

        {groups.length > 0 ? (
          <>
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>แถว</TableHead>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead className="text-right">เงินสด</TableHead>
                    <TableHead className="text-right">ส่วนลด</TableHead>
                    <TableHead>วันที่</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g, i) => (
                    <TableRow key={`${g.rowNumber}-${g.kind}-${i}`}>
                      <TableCell className="tabular-nums">{g.rowNumber}</TableCell>
                      <TableCell className="tabular-nums">{g.studentCode}</TableCell>
                      <TableCell>{g.studentName}</TableCell>
                      <TableCell>{KIND_LABEL[g.kind]}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(g.netCash)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {g.discount > 0 ? formatBaht(g.discount) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {g.paidDateIso ? formatThaiDate(`${g.paidDateIso}T12:00:00+07:00`) : "—"}
                      </TableCell>
                      <TableCell
                        className={cn("whitespace-nowrap", g.willImport ? "text-emerald-700" : "text-destructive")}
                      >
                        {g.willImport ? "จะนำเข้า" : `ข้าม — ${g.reason}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-sm text-muted-foreground">
              พร้อมนำเข้า {willImportCount} รายการ · ข้าม {skipCount} รายการ
            </p>
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={submitting || parsing || willImportCount === 0} onClick={handleConfirm}>
            {submitting ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${willImportCount} รายการ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire the dialog into `payments-panel.tsx`**

In `src/components/finance/payments-panel.tsx`, add the import near the existing `PaymentImportDialog` import (around line 38):

```tsx
import { XlsxPaymentImportDialog } from "@/components/finance/xlsx-payment-import-dialog";
```

Add state alongside the existing `importOpen` state (search for `const [importOpen, setImportOpen] = useState`):

```tsx
const [xlsxImportOpen, setXlsxImportOpen] = useState(false);
```

Add a second button next to the existing "นำเข้า CSV" button (around line 531-536):

```tsx
<CardHeader className="flex flex-row items-center justify-between">
  <CardTitle className="text-base">รับชำระเงิน</CardTitle>
  <div className="flex gap-2">
    <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
      นำเข้า CSV
    </Button>
    <Button type="button" variant="outline" size="sm" onClick={() => setXlsxImportOpen(true)}>
      นำเข้า XLSX
    </Button>
  </div>
</CardHeader>
```

Render the new dialog next to the existing one (around line 1048-1059):

```tsx
{ctx ? (
  <XlsxPaymentImportDialog
    open={xlsxImportOpen}
    onOpenChange={setXlsxImportOpen}
    academicYearId={ctx.academicYearId}
    academicYearName={ctx.academicYearName}
    semesterId={ctx.semesterId}
    onImported={() => {
      invalidateFinanceQueries(queryClient);
      router.refresh();
    }}
  />
) : null}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/xlsx-payment-import-dialog.tsx src/components/finance/payments-panel.tsx
git commit -m "feat(finance): add XLSX payment backfill import dialog"
```

---

## Task 8: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Seed a matching fixture**

In a dev/staging Supabase project, create one student (code `13777`, name ศิริลัดดา คชรินทร์) enrolled in the current semester, with two open invoices:
- "ค่าธรรมเนียมการศึกษา", `subtotal = 2900`, `total_amount = 2900`, `is_reimbursable = false`, with invoice_lines whose fee_items include names like "ค่าเอกสารประกอบการเรียนและวัดผล" and "ค่าครูสอนภาษาต่างประเทศ" (no "ประกัน" in any line name)
- "ค่าประกันอุบัติเหตุ", `subtotal = 200`, `total_amount = 200`, with one invoice_line whose fee_item name contains "ประกัน"

- [ ] **Step 2: Start the dev server and run the import**

Run: `npm run dev`
Navigate to `/payments`, click "นำเข้า XLSX", upload the sample file at `C:\Users\Makawat_PC\Downloads\Book2.xlsx`.

Expected preview:
- Row 4, tuition group: เงินสด ฿2,900, ส่วนลด —, สถานะ "จะนำเข้า"
- Row 4, insurance group: เงินสด ฿0, ส่วนลด ฿200, สถานะ "จะนำเข้า"

- [ ] **Step 3: Confirm the import and verify results**

Click "ยืนยันนำเข้า 2 รายการ". Expected toast: "นำเข้าสำเร็จ 2 รายการ".

Then verify in the DB / `/invoices` page:
- "ค่าธรรมเนียมการศึกษา" invoice: `status = paid`, `paid_amount = 2900`, one new `payments` row (`amount = 2900`, `note = 53-2606`), one `receipts` row
- "ค่าประกันอุบัติเหตุ" invoice: `status = paid`, `paid_amount = 0`, `total_amount = 0`, `discount_value = 200` — and **no** new `payments`/`receipts` row for it, but one new `invoice_discount_log` row (`discount_value = 200`)

- [ ] **Step 4: Re-upload the same file and confirm idempotency of the reject path**

Upload `Book2.xlsx` again. Expected preview: both groups show "ข้าม — ใบแจ้งหนี้นี้ชำระแล้ว" (since both invoices are now `paid` from Step 3), confirming the already-settled guard works and prevents double-import.

---

## Self-Review Notes

- **Spec coverage:** column mapping/grouping (Task 4), all 5 validation rules incl. row/group-level reject (Task 5), Path A/B execution split incl. the accounting no-zero-receipt rule (Tasks 1-2, 6), voucher → `payments.note` / `invoice_discount_log.note` (Task 6), UI preview with per-group status (Task 7), manual verification against the real sample file (Task 8) — all spec sections are covered.
- **Placeholder scan:** none found — every step has runnable code or an exact command.
- **Type consistency:** `ImportGroup`/`InvoiceCandidate`/`GroupValidationResult` (Task 4-5) match the types imported and used in `payments.ts` (Task 6) and `xlsx-payment-import-dialog.tsx` (Task 7); `XlsxImportGroupInput` fields match what the dialog constructs and what the server action destructures.
