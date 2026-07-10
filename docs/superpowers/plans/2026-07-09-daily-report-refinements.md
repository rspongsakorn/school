# เอกสารรายงานรายวัน - ปรับปรุง Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ปีการศึกษา column and A4-landscape print sizing to the receipt-issuance report, and replace the daily remittance slip's single hardcoded line item with a real breakdown by receipt type.

**Architecture:** `ReceiptIssuanceView` gains a `yearSemesterLabel` prop (computed once in the panel from existing context) and a print-scoped `<style>` tag. A new query `fetchDailyRemittanceItems` aggregates `payment_allocations` by `receipt_type_id`; `DailyRemittanceSlip` renders one row per returned item instead of a fixed row. `DailyRevenuePanel` wires both changes and adds a second, remittance-only query.

**Tech Stack:** Next.js (App Router), React (client components), TanStack Query, Supabase (Postgres + PostgREST), Vitest.

---

## Spec Reference

Design: `docs/superpowers/specs/2026-07-09-daily-report-refinements-design.md`

## File Structure

- **Modify** `src/lib/queries/reports.ts` — add `DailyRemittanceItem` type and `fetchDailyRemittanceItems` query.
- **Modify** `src/components/finance/receipt-issuance-view.tsx` — add `yearSemesterLabel` prop, ปีการศึกษา column, A4-landscape print style.
- **Modify** `src/components/finance/daily-remittance-slip.tsx` — replace hardcoded row with `items` prop.
- **Modify** `src/components/finance/daily-revenue-panel.tsx` — compute `yearSemesterLabel`, add the remittance-items query, pass new props.

---

### Task 1: Add `fetchDailyRemittanceItems` query

**Files:**
- Modify: `src/lib/queries/reports.ts` (add near `fetchDiscountReport`, which uses the same join-and-group-by-id pattern at lines 643-680)

- [ ] **Step 1: Add the type and function**

Add after the `fetchDiscountReport` function (after its closing `}`):

```ts
export type DailyRemittanceItem = {
  receiptTypeId: string;
  code: string;
  name: string;
  amount: number;
};

export async function fetchDailyRemittanceItems(params: {
  academicYearId: string;
  dateFrom: string;
  dateTo: string;
  method?: "all" | "cash" | "transfer";
}): Promise<DailyRemittanceItem[]> {
  const supabase = createClient();

  let query = supabase
    .from("payment_allocations")
    .select(
      `
      amount,
      payments!inner ( status, academic_year_id, paid_at, payment_method ),
      student_invoices!inner ( receipt_type_id, receipt_types ( code, name ) )
    `,
    )
    .eq("payments.status", "active")
    .eq("payments.academic_year_id", params.academicYearId)
    .gte("payments.paid_at", `${params.dateFrom}T00:00:00+07:00`)
    .lte("payments.paid_at", `${params.dateTo}T23:59:59.999+07:00`);

  if (params.method && params.method !== "all") {
    query = query.eq("payments.payment_method", params.method);
  }

  type Row = {
    amount: string;
    student_invoices: {
      receipt_type_id: string;
      receipt_types: { code: string; name: string } | null;
    };
  };

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const byType = new Map<string, DailyRemittanceItem>();
  for (const r of rows) {
    const amount = Number(r.amount);
    const receiptTypeId = r.student_invoices.receipt_type_id;
    const existing = byType.get(receiptTypeId);
    if (existing) {
      existing.amount = Math.round((existing.amount + amount) * 100) / 100;
    } else {
      byType.set(receiptTypeId, {
        receiptTypeId,
        code: r.student_invoices.receipt_types?.code ?? "—",
        name: r.student_invoices.receipt_types?.name ?? "—",
        amount,
      });
    }
  }

  return [...byType.values()].sort((a, b) => a.code.localeCompare(b.code));
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run existing test suite (no new tests in this task — this mirrors the untested `fetchDiscountReport` aggregation pattern already in the file)**

Run: `npm test -- reports`
Expected: all existing tests still PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/reports.ts
git commit -m "feat(reports): add fetchDailyRemittanceItems query grouped by receipt type"
```

---

### Task 2: Add ปีการศึกษา column and A4 landscape print to `ReceiptIssuanceView`

**Files:**
- Modify: `src/components/finance/receipt-issuance-view.tsx`

Current file (full content, from `src/components/finance/receipt-issuance-view.tsx`):

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { flattenReceiptsForIssuanceReport, type DailyDetailReceipt } from "@/lib/queries/reports";

type ReceiptIssuanceViewProps = {
  receiptsByDate: Record<string, DailyDetailReceipt[]>;
};

export function ReceiptIssuanceView({ receiptsByDate }: ReceiptIssuanceViewProps) {
  const receipts = flattenReceiptsForIssuanceReport(receiptsByDate);
  const total = receipts
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + r.amount, 0);

  if (receipts.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>เลขที่ใบเสร็จ</TableHead>
          <TableHead>วันที่</TableHead>
          <TableHead>รหัสนักเรียน</TableHead>
          <TableHead>ชื่อ</TableHead>
          <TableHead>ชั้น/ห้อง</TableHead>
          <TableHead className="text-right">จำนวนเงิน</TableHead>
          <TableHead>วิธีจ่าย</TableHead>
          <TableHead>สถานะ</TableHead>
          <TableHead>ทำรายการโดย</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {receipts.map((r) => (
          <TableRow key={r.paymentId}>
            <TableCell className="font-medium">{r.receiptNumber}</TableCell>
            <TableCell>
              {formatThaiDate(r.paidAt)} {r.timeLabel}
            </TableCell>
            <TableCell>{r.studentCode}</TableCell>
            <TableCell>{r.studentName}</TableCell>
            <TableCell>{r.gradeClassroom}</TableCell>
            <TableCell className="text-right tabular-nums">{formatBaht(r.amount)}</TableCell>
            <TableCell>{r.paymentMethod === "cash" ? "เงินสด" : "เงินโอน"}</TableCell>
            <TableCell>
              {r.status === "voided" ? (
                <Badge variant="outline" className="text-xs text-red-600">ยกเลิก</Badge>
              ) : (
                "ปกติ"
              )}
            </TableCell>
            <TableCell>{r.recordedByName}</TableCell>
          </TableRow>
        ))}
        <TableRow className="border-t-2 font-semibold">
          <TableCell colSpan={5}>รวมทั้งช่วง</TableCell>
          <TableCell className="text-right tabular-nums">{formatBaht(total)}</TableCell>
          <TableCell colSpan={3} />
        </TableRow>
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 1: Replace the whole file with this version**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { flattenReceiptsForIssuanceReport, type DailyDetailReceipt } from "@/lib/queries/reports";

type ReceiptIssuanceViewProps = {
  receiptsByDate: Record<string, DailyDetailReceipt[]>;
  yearSemesterLabel: string;
};

export function ReceiptIssuanceView({ receiptsByDate, yearSemesterLabel }: ReceiptIssuanceViewProps) {
  const receipts = flattenReceiptsForIssuanceReport(receiptsByDate);
  const total = receipts
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + r.amount, 0);

  if (receipts.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>;
  }

  return (
    <>
      <style>{"@media print { @page { size: A4 landscape; } }"}</style>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ใบเสร็จ</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>ปีการศึกษา</TableHead>
            <TableHead>รหัสนักเรียน</TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead>ชั้น/ห้อง</TableHead>
            <TableHead className="text-right">จำนวนเงิน</TableHead>
            <TableHead>วิธีจ่าย</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>ทำรายการโดย</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipts.map((r) => (
            <TableRow key={r.paymentId}>
              <TableCell className="font-medium">{r.receiptNumber}</TableCell>
              <TableCell>
                {formatThaiDate(r.paidAt)} {r.timeLabel}
              </TableCell>
              <TableCell>{yearSemesterLabel}</TableCell>
              <TableCell>{r.studentCode}</TableCell>
              <TableCell>{r.studentName}</TableCell>
              <TableCell>{r.gradeClassroom}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBaht(r.amount)}</TableCell>
              <TableCell>{r.paymentMethod === "cash" ? "เงินสด" : "เงินโอน"}</TableCell>
              <TableCell>
                {r.status === "voided" ? (
                  <Badge variant="outline" className="text-xs text-red-600">ยกเลิก</Badge>
                ) : (
                  "ปกติ"
                )}
              </TableCell>
              <TableCell>{r.recordedByName}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 font-semibold">
            <TableCell colSpan={6}>รวมทั้งช่วง</TableCell>
            <TableCell className="text-right tabular-nums">{formatBaht(total)}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableBody>
      </Table>
    </>
  );
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: errors only about the missing `yearSemesterLabel` prop at the call site in `daily-revenue-panel.tsx` (fixed in Task 4) — no errors within this file itself

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/receipt-issuance-view.tsx
git commit -m "feat(reports): add ปีการศึกษา column and A4 landscape print to receipt issuance view"
```

---

### Task 3: Replace hardcoded line item in `DailyRemittanceSlip`

**Files:**
- Modify: `src/components/finance/daily-remittance-slip.tsx`

Current file (full content, from `src/components/finance/daily-remittance-slip.tsx`):

```tsx
"use client";

import { formatBaht, formatThaiDate, bahtText } from "@/lib/format";
import type { DailyRevenueRow } from "@/lib/reports/daily";

type DailyRemittanceSlipProps = {
  summary: DailyRevenueRow[];
  dateFrom: string;
  dateTo: string;
};

export function DailyRemittanceSlip({ summary, dateFrom, dateTo }: DailyRemittanceSlipProps) {
  const totalReceipts = summary.reduce((sum, row) => sum + row.total, 0);
  const totalExpenses = 0; // always 0 — system has no expense-tracking data (see design doc)
  const netTotal = totalReceipts - totalExpenses;

  return (
    <div className="space-y-6 rounded-lg border p-6">
      <div className="text-center">
        <p className="text-base font-bold">ใบนำส่งเงินประจำวัน</p>
        <p className="text-sm text-muted-foreground">
          ประจำวัน {formatThaiDate(`${dateFrom}T00:00:00+07:00`)} ถึง {formatThaiDate(`${dateTo}T00:00:00+07:00`)}
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        {/* Fixed placeholder line item (code 01121) — matches the original paper form;
            not itemized from real transaction categories since none are tracked yet. */}
        <thead>
          <tr className="border-b">
            <th className="w-16 py-1 text-left">ลำดับ</th>
            <th className="w-24 py-1 text-left">รหัสรายการ</th>
            <th className="py-1 text-left">รายการ</th>
            <th className="py-1 text-right">จำนวนเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1">1</td>
            <td className="py-1">01121</td>
            <td className="py-1">ค่าใช้จ่ายอื่นๆ</td>
            <td className="py-1 text-right tabular-nums">{formatBaht(totalReceipts)}</td>
          </tr>
        </tbody>
      </table>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span>รวมรายรับ</span>
          <span className="tabular-nums">{formatBaht(totalReceipts)}</span>
        </div>
        <div className="flex justify-between">
          <span>รวมรายจ่าย</span>
          <span className="tabular-nums">{formatBaht(totalExpenses)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>รวมเป็นเงิน</span>
          <span className="tabular-nums">{formatBaht(netTotal)}</span>
        </div>
      </div>

      <p className="border-y py-2 text-center font-medium">({bahtText(netTotal)})</p>

      <div className="grid grid-cols-2 gap-8 pt-12 text-center text-sm">
        <div>
          <p>ลงชื่อ ..................................................</p>
          <p className="mt-1 text-xs text-muted-foreground">ฝ่ายบัญชีและการเงิน</p>
        </div>
        <div>
          <p>ลงชื่อ ..................................................</p>
          <p className="mt-1 text-xs text-muted-foreground">หัวหน้าฝ่ายบัญชีและการเงิน</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Replace the whole file with this version**

```tsx
"use client";

import { formatBaht, formatThaiDate, bahtText } from "@/lib/format";
import type { DailyRemittanceItem } from "@/lib/queries/reports";

type DailyRemittanceSlipProps = {
  items: DailyRemittanceItem[];
  dateFrom: string;
  dateTo: string;
};

export function DailyRemittanceSlip({ items, dateFrom, dateTo }: DailyRemittanceSlipProps) {
  const totalReceipts = items.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = 0; // always 0 — system has no expense-tracking data (see design doc)
  const netTotal = totalReceipts - totalExpenses;

  return (
    <div className="space-y-6 rounded-lg border p-6">
      <div className="text-center">
        <p className="text-base font-bold">ใบนำส่งเงินประจำวัน</p>
        <p className="text-sm text-muted-foreground">
          ประจำวัน {formatThaiDate(`${dateFrom}T00:00:00+07:00`)} ถึง {formatThaiDate(`${dateTo}T00:00:00+07:00`)}
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-16 py-1 text-left">ลำดับ</th>
            <th className="w-24 py-1 text-left">รหัสรายการ</th>
            <th className="py-1 text-left">รายการ</th>
            <th className="py-1 text-right">จำนวนเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.receiptTypeId}>
              <td className="py-1">{index + 1}</td>
              <td className="py-1">{item.code}</td>
              <td className="py-1">{item.name}</td>
              <td className="py-1 text-right tabular-nums">{formatBaht(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span>รวมรายรับ</span>
          <span className="tabular-nums">{formatBaht(totalReceipts)}</span>
        </div>
        <div className="flex justify-between">
          <span>รวมรายจ่าย</span>
          <span className="tabular-nums">{formatBaht(totalExpenses)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>รวมเป็นเงิน</span>
          <span className="tabular-nums">{formatBaht(netTotal)}</span>
        </div>
      </div>

      <p className="border-y py-2 text-center font-medium">({bahtText(netTotal)})</p>

      <div className="grid grid-cols-2 gap-8 pt-12 text-center text-sm">
        <div>
          <p>ลงชื่อ ..................................................</p>
          <p className="mt-1 text-xs text-muted-foreground">ฝ่ายบัญชีและการเงิน</p>
        </div>
        <div>
          <p>ลงชื่อ ..................................................</p>
          <p className="mt-1 text-xs text-muted-foreground">หัวหน้าฝ่ายบัญชีและการเงิน</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: errors only at the call site in `daily-revenue-panel.tsx` (fixed in Task 4) — no errors within this file itself

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/daily-remittance-slip.tsx
git commit -m "feat(reports): itemize daily remittance slip by receipt type"
```

---

### Task 4: Wire both changes into `DailyRevenuePanel`

**Files:**
- Modify: `src/components/finance/daily-revenue-panel.tsx`

Current relevant sections (`src/components/finance/daily-revenue-panel.tsx`, full file already shown above in project context — key lines: imports at 1-30, state/query at 54-88, render at 90-213).

- [ ] **Step 1: Add `fetchDailyRemittanceItems` to the import from `@/lib/queries/reports`**

Change line 8:

```tsx
import { fetchDailyRevenue } from "@/lib/queries/reports";
```

to:

```tsx
import { fetchDailyRevenue, fetchDailyRemittanceItems } from "@/lib/queries/reports";
```

- [ ] **Step 2: Add the remittance-items query and the `yearSemesterLabel` value**

Add directly after the existing `useQuery` block (after the closing `});` that currently ends at line 75, before `const summary = data?.summary ?? [];`):

```tsx
  const { data: remittanceItems } = useQuery({
    queryKey: ["daily-remittance-items", ctx?.academicYearId, dateFrom, dateTo, method],
    queryFn: () =>
      fetchDailyRemittanceItems({
        academicYearId: ctx!.academicYearId,
        dateFrom,
        dateTo,
        method,
      }),
    enabled: !!ctx && docType === "remittance",
  });
```

Add directly after the `totals` calculation (after its closing `);` at line 88, before the `return (`):

```tsx
  const yearSemesterLabel = ctx ? `${ctx.semesterNumber}/${ctx.academicYearName}` : "—";
```

- [ ] **Step 3: Pass the new props to the two child components**

Change:

```tsx
          ) : docType === "receipts" ? (
            <ReceiptIssuanceView receiptsByDate={receiptsByDate} />
          ) : docType === "remittance" ? (
            <DailyRemittanceSlip summary={summary} dateFrom={dateFrom} dateTo={dateTo} />
          ) : (
```

to:

```tsx
          ) : docType === "receipts" ? (
            <ReceiptIssuanceView receiptsByDate={receiptsByDate} yearSemesterLabel={yearSemesterLabel} />
          ) : docType === "remittance" ? (
            <DailyRemittanceSlip items={remittanceItems ?? []} dateFrom={dateFrom} dateTo={dateTo} />
          ) : (
```

- [ ] **Step 4: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all existing tests PASS (no new tests added in this task — pure wiring)

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/daily-revenue-panel.tsx
git commit -m "feat(reports): wire remittance items query and year/semester label into daily revenue panel"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server** (use the project's preview tooling, e.g. `preview_start` with the existing `dev` launch config)

- [ ] **Step 2: Navigate to `/reports/daily`, log in as a finance/admin user, ensure there is at least one active payment in the selected date range** (seed temporary data via the Supabase REST API with the service-role key if the environment has none, the same way Task 6 of the prior plan did — remember to delete it afterward)

- [ ] **Step 3: Select "รายงานการออกใบเสร็จ"** and confirm:
  - A "ปีการศึกษา" column appears between "วันที่" and "รหัสนักเรียน", showing the same `เทอม/ปี` value (e.g. "1/2569") on every row
  - The total row's label cell now spans 6 columns (not overlapping the year/semester column)
  - Opening print preview (via the existing print button / `window.print()`) shows the page in A4 landscape orientation

- [ ] **Step 4: Select "ใบนำส่งเงินประจำวัน"** and confirm:
  - The line-item table shows one row per receipt type actually collected in the range (not the old fixed "01121 / ค่าใช้จ่ายอื่นๆ" row)
  - รวมรายรับ equals the sum of those rows, and matches the total shown on the "สรุปรายวัน" view for the same filters
  - Switching back to "สรุปรายวัน" still prints portrait (unaffected by the landscape style, since that `<style>` tag only exists while `ReceiptIssuanceView` is mounted)

- [ ] **Step 5: Clean up any seeded temporary data** created in Step 2, the same way the prior plan's Task 6 did (delete payments, enrollment, student, classroom, grade level, semester, academic year, in that dependency order)

No commit for this task — it's verification only. If any step fails, return to the relevant task above and fix before proceeding.

---

## Self-Review Notes

- **Spec coverage:** §3.1 (ปีการศึกษา column) → Task 2; §3.2 (A4 landscape) → Task 2; §4.1 (`fetchDailyRemittanceItems`) → Task 1; §4.2 (`DailyRemittanceSlip` itemization) → Task 3; §4.3 (panel wiring, conditional query) → Task 4; §5 (manual testing) → Task 5.
- **Type consistency:** `DailyRemittanceItem` fields (`receiptTypeId`, `code`, `name`, `amount`) defined in Task 1 are used identically in Task 3's component and Task 4's `remittanceItems ?? []` pass-through. `yearSemesterLabel` prop name matches between Task 2's component and Task 4's call site. `ReceiptIssuanceView` and `DailyRemittanceSlip` prop renames (`items` replacing `summary`) are consistent between Task 3 and Task 4 — the panel no longer passes `summary` to `DailyRemittanceSlip`.
- **No placeholders:** every step has literal code, exact file paths, and concrete run/expect pairs.
