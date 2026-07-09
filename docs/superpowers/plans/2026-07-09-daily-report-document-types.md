# เอกสารรายงานรายวัน 2 ประเภท Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "รูปแบบเอกสาร" (document type) selector to the existing `/reports/daily` page so finance staff can print two additional official documents — a flat receipt-issuance list and a daily cash remittance slip — using the same date-range/payment-method filters already on the page.

**Architecture:** Extend the existing `fetchDailyRevenue` query to include `gradeClassroom` and `recordedByName` per receipt. Add a local `docType` state to `DailyRevenuePanel` that conditionally renders one of three views: the existing summary table, a new `ReceiptIssuanceView`, or a new `DailyRemittanceSlip`. No new routes, no new nav entries, no schema changes.

**Tech Stack:** Next.js (App Router), React (client components), TanStack Query, Supabase (Postgres + PostgREST), Vitest, existing `Table`/`Select` UI primitives.

---

## Spec Reference

Design: `docs/superpowers/specs/2026-07-09-daily-report-document-types-design.md`

## File Structure

- **Modify** `src/lib/queries/reports.ts` — extend `DailyDetailReceipt` type and `fetchDailyRevenue` to join classroom + recorder name, add `semesterId` param.
- **Modify** `src/components/finance/daily-revenue-panel.tsx` — add doc-type `Select`, pass `semesterId` into the query, conditional render.
- **Create** `src/components/finance/receipt-issuance-view.tsx` — flat receipt table + total row.
- **Create** `src/components/finance/daily-remittance-slip.tsx` — remittance slip layout.
- **Create** `src/lib/queries/reports.test.ts` — unit test for the pure flatten/sort helper extracted for the receipt view (only new logic in this plan; everything else reuses existing helpers).

---

### Task 1: Extend `fetchDailyRevenue` with classroom + recorder name

**Files:**
- Modify: `src/lib/queries/reports.ts:436-525` (types `DailyDetailReceipt`, `DailyRevenueResult`, function `fetchDailyRevenue`)

Currently (`src/lib/queries/reports.ts:436-525`):

```ts
export type DailyDetailReceipt = {
  paymentId: string;
  receiptNumber: string;
  paidAt: string;
  timeLabel: string;
  studentName: string;
  studentCode: string;
  paymentMethod: "cash" | "transfer";
  amount: number;
  status: "active" | "voided";
};

export type DailyRevenueResult = {
  summary: DailyRevenueRow[];
  receiptsByDate: Record<string, DailyDetailReceipt[]>;
};

export async function fetchDailyRevenue(params: {
  academicYearId: string;
  dateFrom: string; // YYYY-MM-DD (Bangkok day)
  dateTo: string; // YYYY-MM-DD (Bangkok day)
  method?: "all" | "cash" | "transfer";
}): Promise<DailyRevenueResult> {
  const supabase = createClient();

  const fromIso = `${params.dateFrom}T00:00:00+07:00`;
  const toIso = `${params.dateTo}T23:59:59.999+07:00`;

  let query = supabase
    .from("payments")
    .select(
      `
      id,
      receipt_number,
      amount,
      payment_method,
      paid_at,
      status,
      students!inner ( student_code, first_name, last_name )
    `,
    )
    .eq("academic_year_id", params.academicYearId)
    .gte("paid_at", fromIso)
    .lte("paid_at", toIso)
    .order("paid_at", { ascending: false });

  if (params.method && params.method !== "all") {
    query = query.eq("payment_method", params.method);
  }

  type Row = {
    id: string;
    receipt_number: string;
    amount: number;
    payment_method: "cash" | "transfer";
    paid_at: string;
    status: "active" | "voided";
    students: { student_code: string; first_name: string; last_name: string };
  };

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const summary = groupDailyRevenue(
    rows.map((r) => ({
      amount: Number(r.amount),
      paymentMethod: r.payment_method,
      paidAt: r.paid_at,
      status: r.status,
    })),
  );

  const receiptsByDate: Record<string, DailyDetailReceipt[]> = {};
  for (const r of rows) {
    const key = bangkokDateKey(r.paid_at);
    (receiptsByDate[key] ??= []).push({
      paymentId: r.id,
      receiptNumber: r.receipt_number,
      paidAt: r.paid_at,
      timeLabel: formatThaiTime(r.paid_at),
      studentName: formatStudentName(r.students.first_name, r.students.last_name),
      studentCode: r.students.student_code,
      paymentMethod: r.payment_method,
      amount: Number(r.amount),
      status: r.status,
    });
  }

  return { summary, receiptsByDate };
}
```

`getStudentGradeMap(semesterId)` is already defined at `src/lib/queries/reports.ts:28-59` and returns `Map<studentId, gradeClassroomLabel>`.

- [ ] **Step 1: Replace the block above with the extended version**

```ts
export type DailyDetailReceipt = {
  paymentId: string;
  receiptNumber: string;
  paidAt: string;
  timeLabel: string;
  studentName: string;
  studentCode: string;
  gradeClassroom: string;
  paymentMethod: "cash" | "transfer";
  amount: number;
  status: "active" | "voided";
  recordedByName: string;
};

export type DailyRevenueResult = {
  summary: DailyRevenueRow[];
  receiptsByDate: Record<string, DailyDetailReceipt[]>;
};

export async function fetchDailyRevenue(params: {
  academicYearId: string;
  semesterId: string;
  dateFrom: string; // YYYY-MM-DD (Bangkok day)
  dateTo: string; // YYYY-MM-DD (Bangkok day)
  method?: "all" | "cash" | "transfer";
}): Promise<DailyRevenueResult> {
  const supabase = createClient();

  const fromIso = `${params.dateFrom}T00:00:00+07:00`;
  const toIso = `${params.dateTo}T23:59:59.999+07:00`;

  let query = supabase
    .from("payments")
    .select(
      `
      id,
      receipt_number,
      amount,
      payment_method,
      paid_at,
      status,
      student_id,
      students!inner ( student_code, first_name, last_name ),
      profiles!payments_recorded_by_fkey ( display_name )
    `,
    )
    .eq("academic_year_id", params.academicYearId)
    .gte("paid_at", fromIso)
    .lte("paid_at", toIso)
    .order("paid_at", { ascending: false });

  if (params.method && params.method !== "all") {
    query = query.eq("payment_method", params.method);
  }

  type Row = {
    id: string;
    receipt_number: string;
    amount: number;
    payment_method: "cash" | "transfer";
    paid_at: string;
    status: "active" | "voided";
    student_id: string;
    students: { student_code: string; first_name: string; last_name: string };
    profiles: { display_name: string } | null;
  };

  const [{ data }, gradeByStudent] = await Promise.all([
    query,
    getStudentGradeMap(params.semesterId),
  ]);
  const rows = (data ?? []) as unknown as Row[];

  const summary = groupDailyRevenue(
    rows.map((r) => ({
      amount: Number(r.amount),
      paymentMethod: r.payment_method,
      paidAt: r.paid_at,
      status: r.status,
    })),
  );

  const receiptsByDate: Record<string, DailyDetailReceipt[]> = {};
  for (const r of rows) {
    const key = bangkokDateKey(r.paid_at);
    (receiptsByDate[key] ??= []).push({
      paymentId: r.id,
      receiptNumber: r.receipt_number,
      paidAt: r.paid_at,
      timeLabel: formatThaiTime(r.paid_at),
      studentName: formatStudentName(r.students.first_name, r.students.last_name),
      studentCode: r.students.student_code,
      gradeClassroom: gradeByStudent.get(r.student_id) ?? "—",
      paymentMethod: r.payment_method,
      amount: Number(r.amount),
      status: r.status,
      recordedByName: r.profiles?.display_name ?? "—",
    });
  }

  return { summary, receiptsByDate };
}
```

- [ ] **Step 2: Run the existing test suite to confirm nothing broke**

Run: `npm test -- reports`
Expected: all existing tests in `src/lib/reports/*.test.ts` still PASS (this file has no dedicated test yet, so this just checks no import/type errors surface via `vitest run`'s collection phase)

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no new type errors. If the join alias `profiles!payments_recorded_by_fkey` errors under Supabase's generated types (untyped client is used here via `as unknown as Row[]`, so it should not), leave as-is since the cast bypasses generated types.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/reports.ts
git commit -m "feat(reports): add gradeClassroom and recordedByName to daily revenue receipts"
```

---

### Task 2: Update `DailyRevenuePanel` to pass `semesterId` into the query

**Files:**
- Modify: `src/components/finance/daily-revenue-panel.tsx:55-65`

Current query call (`src/components/finance/daily-revenue-panel.tsx:55-65`):

```tsx
  const { data, isLoading } = useQuery({
    queryKey: ["daily-revenue", ctx?.academicYearId, dateFrom, dateTo, method],
    queryFn: () =>
      fetchDailyRevenue({
        academicYearId: ctx!.academicYearId,
        dateFrom,
        dateTo,
        method,
      }),
    enabled: !!ctx,
  });
```

- [ ] **Step 1: Add `semesterId` to the query key and call**

```tsx
  const { data, isLoading } = useQuery({
    queryKey: ["daily-revenue", ctx?.academicYearId, ctx?.semesterId, dateFrom, dateTo, method],
    queryFn: () =>
      fetchDailyRevenue({
        academicYearId: ctx!.academicYearId,
        semesterId: ctx!.semesterId,
        dateFrom,
        dateTo,
        method,
      }),
    enabled: !!ctx,
  });
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (previously `fetchDailyRevenue` required `semesterId`; this call now supplies it)

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/daily-revenue-panel.tsx
git commit -m "feat(reports): pass semesterId into fetchDailyRevenue"
```

---

### Task 3: `ReceiptIssuanceView` component + flatten helper test

**Files:**
- Create: `src/components/finance/receipt-issuance-view.tsx`
- Create: `src/lib/queries/reports.test.ts`

The component needs to flatten `receiptsByDate` (a `Record<string, DailyDetailReceipt[]>`) into one sorted array (oldest → newest, per the sample document) and compute an active-only total. This flatten+sort+total logic is pure and worth a unit test — extract it as an exported helper in `reports.ts` rather than inlining it in the component, so it's testable without rendering React.

- [ ] **Step 1: Write the failing test**

Create `src/lib/queries/reports.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flattenReceiptsForIssuanceReport, type DailyDetailReceipt } from "./reports";

const r = (over: Partial<DailyDetailReceipt>): DailyDetailReceipt => ({
  paymentId: "p1",
  receiptNumber: "ETC0001",
  paidAt: "2026-07-07T02:00:00Z",
  timeLabel: "09:00",
  studentName: "เด็กหญิงทดสอบ ทดสอบ",
  studentCode: "69210001",
  gradeClassroom: "ป.1/1",
  paymentMethod: "cash",
  amount: 150,
  status: "active",
  recordedByName: "นันทิศา",
  ...over,
});

describe("flattenReceiptsForIssuanceReport", () => {
  it("sorts all receipts across dates oldest to newest", () => {
    const byDate = {
      "2026-07-08": [r({ paymentId: "b", paidAt: "2026-07-08T02:00:00Z" })],
      "2026-07-07": [r({ paymentId: "a", paidAt: "2026-07-07T02:00:00Z" })],
    };
    const flat = flattenReceiptsForIssuanceReport(byDate);
    expect(flat.map((x) => x.paymentId)).toEqual(["a", "b"]);
  });

  it("totals only active receipts, excluding voided", () => {
    const byDate = {
      "2026-07-07": [
        r({ paymentId: "a", amount: 150, status: "active" }),
        r({ paymentId: "b", amount: 999, status: "voided" }),
      ],
    };
    const flat = flattenReceiptsForIssuanceReport(byDate);
    const total = flat
      .filter((x) => x.status === "active")
      .reduce((sum, x) => sum + x.amount, 0);
    expect(total).toBe(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reports.test`
Expected: FAIL — `flattenReceiptsForIssuanceReport` is not exported from `./reports`

- [ ] **Step 3: Add the helper to `src/lib/queries/reports.ts`**

Add directly below the `fetchDailyRevenue` function (after its closing brace, i.e. after line with `return { summary, receiptsByDate };\n}` from Task 1):

```ts
export function flattenReceiptsForIssuanceReport(
  receiptsByDate: Record<string, DailyDetailReceipt[]>,
): DailyDetailReceipt[] {
  return Object.values(receiptsByDate)
    .flat()
    .sort((a, b) => (a.paidAt < b.paidAt ? -1 : a.paidAt > b.paidAt ? 1 : 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- reports.test`
Expected: PASS (2 tests)

- [ ] **Step 5: Create the view component**

Create `src/components/finance/receipt-issuance-view.tsx`:

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

- [ ] **Step 6: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries/reports.ts src/lib/queries/reports.test.ts src/components/finance/receipt-issuance-view.tsx
git commit -m "feat(reports): add receipt issuance report view"
```

---

### Task 4: `DailyRemittanceSlip` component

**Files:**
- Create: `src/components/finance/daily-remittance-slip.tsx`

Uses the existing `bahtText` helper (`src/lib/format.ts:51`) and the `summary` array already computed by `fetchDailyRevenue` (`DailyRevenueRow[]`, each with `.total`).

- [ ] **Step 1: Create the component**

Create `src/components/finance/daily-remittance-slip.tsx`:

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
  const totalExpenses = 0;
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
          <p>ลงชื่อ .................................................. ผู้ส่งเงิน</p>
          <p className="mt-1 text-xs text-muted-foreground">ฝ่ายบัญชีและการเงิน</p>
        </div>
        <div>
          <p>ลงชื่อ .................................................. ผู้รับเงิน</p>
          <p className="mt-1 text-xs text-muted-foreground">หัวหน้าฝ่ายบัญชีและการเงิน</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/daily-remittance-slip.tsx
git commit -m "feat(reports): add daily remittance slip view"
```

---

### Task 5: Wire the document-type selector into `DailyRevenuePanel`

**Files:**
- Modify: `src/components/finance/daily-revenue-panel.tsx`

Current imports and state (`src/components/finance/daily-revenue-panel.tsx:1-53`) and render body (`:80-187`) stay mostly intact; this task adds a `docType` selector and conditional rendering around the existing table.

- [ ] **Step 1: Add imports**

At the top of `src/components/finance/daily-revenue-panel.tsx`, add after the existing `ReportLetterhead` import (line 10):

```tsx
import { ReceiptIssuanceView } from "@/components/finance/receipt-issuance-view";
import { DailyRemittanceSlip } from "@/components/finance/daily-remittance-slip";
```

- [ ] **Step 2: Add a `DOC_TYPE_ITEMS` constant**

Add next to the existing `METHOD_ITEMS` constant (`src/components/finance/daily-revenue-panel.tsx:30-34`):

```tsx
const DOC_TYPE_ITEMS = [
  { value: "summary", label: "สรุปรายวัน" },
  { value: "receipts", label: "รายงานการออกใบเสร็จ" },
  { value: "remittance", label: "ใบนำส่งเงินประจำวัน" },
];
```

- [ ] **Step 3: Add `docType` state**

In the `DailyRevenuePanel` function body, next to the existing `method` state (`src/components/finance/daily-revenue-panel.tsx:52`):

```tsx
  const [docType, setDocType] = useState<"summary" | "receipts" | "remittance">("summary");
```

- [ ] **Step 4: Add the selector to the toolbar row**

In the toolbar div (`src/components/finance/daily-revenue-panel.tsx:91-115`), add the new `Select` right after the existing payment-method `Select` (which ends at line 111, just before `<div className="ml-auto">`):

```tsx
            <Select value={docType} onValueChange={(v) => setDocType((v ?? "summary") as typeof docType)} items={DOC_TYPE_ITEMS}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="รูปแบบเอกสาร" />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
```

- [ ] **Step 5: Wrap the existing table body in a conditional**

Replace the block that starts with `{isLoading ? (` and ends at the closing `)}` right before `</div>\n      </main>` (`src/components/finance/daily-revenue-panel.tsx:117-182`) so that the loading/empty checks stay shared, but the "loaded" branch picks a view based on `docType`. Current end of that block:

```tsx
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : summary.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            <Table>
              {/* ...existing summary table markup... */}
            </Table>
          )}
```

New version — keep the existing `<Table>...</Table>` markup exactly as-is (rename it implicitly to the "summary" branch) and add two sibling branches:

```tsx
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : summary.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : docType === "receipts" ? (
            <ReceiptIssuanceView receiptsByDate={receiptsByDate} />
          ) : docType === "remittance" ? (
            <DailyRemittanceSlip summary={summary} dateFrom={dateFrom} dateTo={dateTo} />
          ) : (
            <Table>
              {/* ...existing summary table markup, unchanged... */}
            </Table>
          )}
```

Do not touch the markup inside the existing `<Table>...</Table>` — only add the two new `docType` branches before it.

- [ ] **Step 6: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/daily-revenue-panel.tsx
git commit -m "feat(reports): add document-type selector to daily revenue page"
```

---

### Task 6: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server** (use the project's preview tooling, e.g. `preview_start` with the existing `dev` launch config)

- [ ] **Step 2: Navigate to `/reports/daily`, log in as a finance/admin user**

- [ ] **Step 3: Select "รายงานการออกใบเสร็จ"** and confirm the table shows one row per receipt across the whole date range, with ชั้น/ห้อง and ทำรายการโดย populated (not "—" for real data), and the total row sums only active receipts.

- [ ] **Step 4: Select "ใบนำส่งเงินประจำวัน"** and confirm it shows the single "ค่าใช้จ่ายอื่นๆ" line matching the summary total, the Thai-words amount line, and two blank signature lines.

- [ ] **Step 5: Switch payment-method filter to "เงินโอน" only** and confirm both new views update to reflect the filtered total (per spec §6 note — remittance slip follows the selected filter, not cash-only).

- [ ] **Step 6: Trigger print preview (`window.print()` via the existing print button)** for both new views and confirm the letterhead shows and the sidebar/toolbar are hidden, consistent with the existing summary view's print behavior.

- [ ] **Step 7: Test the empty state** — pick a date range with no payments and confirm all three doc types show the "ไม่มีข้อมูลในช่วงที่เลือก" message (not a crash).

No commit for this task — it's verification only. If any step fails, return to the relevant task above and fix before proceeding.

---

## Self-Review Notes

- **Spec coverage:** §3 data layer → Task 1; §4 selector → Task 5; §5 `ReceiptIssuanceView` → Task 3; §6 `DailyRemittanceSlip` → Task 4; §7 print CSS (no changes needed) → confirmed via Task 6 manual print check; §8 testing → Task 3's unit test + Task 6 manual pass.
- **Type consistency:** `DailyDetailReceipt` fields (`gradeClassroom`, `recordedByName`) defined in Task 1 are the exact names used in Task 3's component and test. `fetchDailyRevenue`'s new `semesterId` param (Task 1) is supplied in Task 2. `flattenReceiptsForIssuanceReport` name matches between Task 3's test import and its implementation and the component's import.
- **No placeholders:** every step has literal code, exact file paths/line ranges, and concrete run/expect pairs.
