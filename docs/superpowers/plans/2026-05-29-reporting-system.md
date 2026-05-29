# Reporting System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the reporting module — add a daily-revenue report, group-by-room debtors, collection stats by classroom/overall, and per-student roster + statement, all printable to PDF with an official letterhead.

**Architecture:** Follow the existing client-side report pattern (client component + `@tanstack/react-query` + query functions in `src/lib/queries/reports.ts`). Pure aggregation/formatting logic is extracted into `src/lib/reports/` for unit testing. Printing uses `window.print()` plus print CSS; a `ReportLetterhead` shows only on print.

**Tech Stack:** Next.js 16 (App Router), React 19, TanStack Query, Supabase JS client, Tailwind CSS v4, Vitest (node env, `*.test.ts` pure logic only — no DOM testing lib).

**Spec:** [docs/superpowers/specs/2026-05-29-reporting-system-design.md](../specs/2026-05-29-reporting-system-design.md)

---

## File Structure

**New — pure logic (unit tested):**
- `src/lib/reports/date.ts` — `bangkokDateKey()` (Asia/Bangkok day bucketing)
- `src/lib/reports/date.test.ts`
- `src/lib/reports/daily.ts` — `groupDailyRevenue()` (pure aggregation)
- `src/lib/reports/daily.test.ts`

**New — UI primitives (manual verified):**
- `src/components/finance/report-toolbar.tsx` — print button
- `src/components/finance/report-letterhead.tsx` — official letterhead (print only)

**New — pages + panels (manual verified):**
- `src/app/(dashboard)/reports/daily/page.tsx`
- `src/components/finance/daily-revenue-panel.tsx`
- `src/app/(dashboard)/reports/students/page.tsx`
- `src/components/finance/student-roster-panel.tsx`
- `src/app/(dashboard)/reports/students/[studentId]/page.tsx`
- `src/components/finance/student-statement-panel.tsx`

**Modified:**
- `src/lib/format.ts` — add `formatThaiTime()`
- `src/lib/queries/reports.ts` — add `fetchDailyRevenue`, `fetchCollectionsByClassroom`, `fetchCollectionsSummary`, `fetchStudentRoster`, `fetchStudentStatement`
- `src/components/finance/outstanding-report-panel.tsx` — group-by-room view + toolbar + letterhead
- `src/components/finance/collections-report-panel.tsx` — level select + toolbar + letterhead
- `src/components/app-sidebar.tsx` — nav entries
- `src/app/globals.css` — print styles

---

## Task 1: Bangkok date-key + Thai time helpers

**Files:**
- Create: `src/lib/reports/date.ts`
- Test: `src/lib/reports/date.test.ts`
- Modify: `src/lib/format.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bangkokDateKey } from "./date";

describe("bangkokDateKey", () => {
  it("returns YYYY-MM-DD for a daytime Bangkok instant", () => {
    // 2026-05-28T05:00:00Z = 12:00 Bangkok (UTC+7)
    expect(bangkokDateKey("2026-05-28T05:00:00Z")).toBe("2026-05-28");
  });

  it("rolls a late-UTC time into the next Bangkok day", () => {
    // 2026-05-28T18:30:00Z = 2026-05-29 01:30 Bangkok
    expect(bangkokDateKey("2026-05-28T18:30:00Z")).toBe("2026-05-29");
  });

  it("keeps a late-evening Bangkok time on the same day", () => {
    // 2026-05-28T16:00:00Z = 23:00 Bangkok on the 28th
    expect(bangkokDateKey("2026-05-28T16:00:00Z")).toBe("2026-05-28");
  });

  it("accepts a Date object", () => {
    expect(bangkokDateKey(new Date("2026-05-28T05:00:00Z"))).toBe("2026-05-28");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/lib/reports/date.test.ts`
Expected: FAIL — cannot find module `./date`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/reports/date.ts`:

```ts
const bangkokDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns the calendar day (YYYY-MM-DD) of an instant in Asia/Bangkok. */
export function bangkokDateKey(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return bangkokDateKeyFormatter.format(date);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/lib/reports/date.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add `formatThaiTime` to format.ts**

In `src/lib/format.ts`, after `formatThaiDateLong` (line 26), add:

```ts
const thaiTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatThaiTime(iso: string | Date) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return thaiTimeFormatter.format(date);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/date.ts src/lib/reports/date.test.ts src/lib/format.ts
git commit -m "feat: add Bangkok date-key and Thai time helpers"
```

---

## Task 2: Daily revenue grouping (pure function)

**Files:**
- Create: `src/lib/reports/daily.ts`
- Test: `src/lib/reports/daily.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reports/daily.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupDailyRevenue, type DailyPayment } from "./daily";

const p = (over: Partial<DailyPayment>): DailyPayment => ({
  amount: 100,
  paymentMethod: "cash",
  paidAt: "2026-05-28T05:00:00Z",
  status: "active",
  ...over,
});

describe("groupDailyRevenue", () => {
  it("splits cash and transfer totals per day", () => {
    const rows = groupDailyRevenue([
      p({ amount: 300, paymentMethod: "cash" }),
      p({ amount: 200, paymentMethod: "transfer" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dateKey: "2026-05-28",
      receiptCount: 2,
      cashTotal: 300,
      transferTotal: 200,
      total: 500,
    });
  });

  it("excludes voided payments from totals but counts them", () => {
    const rows = groupDailyRevenue([
      p({ amount: 300, paymentMethod: "cash" }),
      p({ amount: 999, status: "voided" }),
    ]);
    expect(rows[0]).toMatchObject({
      receiptCount: 1,
      cashTotal: 300,
      total: 300,
      voidedCount: 1,
      voidedAmount: 999,
    });
  });

  it("groups across days and sorts newest first", () => {
    const rows = groupDailyRevenue([
      p({ paidAt: "2026-05-27T05:00:00Z" }),
      p({ paidAt: "2026-05-28T05:00:00Z" }),
    ]);
    expect(rows.map((r) => r.dateKey)).toEqual(["2026-05-28", "2026-05-27"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/lib/reports/daily.test.ts`
Expected: FAIL — cannot find module `./daily`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/reports/daily.ts`:

```ts
import { bangkokDateKey } from "./date";

export type DailyPayment = {
  amount: number;
  paymentMethod: "cash" | "transfer";
  paidAt: string;
  status: "active" | "voided";
};

export type DailyRevenueRow = {
  dateKey: string;
  receiptCount: number;
  cashTotal: number;
  transferTotal: number;
  total: number;
  voidedCount: number;
  voidedAmount: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function groupDailyRevenue(payments: DailyPayment[]): DailyRevenueRow[] {
  const byDate = new Map<string, DailyRevenueRow>();

  for (const payment of payments) {
    const dateKey = bangkokDateKey(payment.paidAt);
    let row = byDate.get(dateKey);
    if (!row) {
      row = {
        dateKey,
        receiptCount: 0,
        cashTotal: 0,
        transferTotal: 0,
        total: 0,
        voidedCount: 0,
        voidedAmount: 0,
      };
      byDate.set(dateKey, row);
    }

    const amount = Number(payment.amount);
    if (payment.status === "voided") {
      row.voidedCount += 1;
      row.voidedAmount = round2(row.voidedAmount + amount);
      continue;
    }

    row.receiptCount += 1;
    if (payment.paymentMethod === "cash") {
      row.cashTotal = round2(row.cashTotal + amount);
    } else {
      row.transferTotal = round2(row.transferTotal + amount);
    }
    row.total = round2(row.total + amount);
  }

  return [...byDate.values()].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/lib/reports/daily.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/daily.ts src/lib/reports/daily.test.ts
git commit -m "feat: add daily revenue grouping logic"
```

---

## Task 3: `fetchDailyRevenue` query

**Files:**
- Modify: `src/lib/queries/reports.ts`

- [ ] **Step 1: Add the query function**

At the end of `src/lib/queries/reports.ts` (before the final `round2` helper, or after it — keep `round2` defined once), add:

```ts
import { bangkokDateKey } from "@/lib/reports/date";
import { groupDailyRevenue, type DailyRevenueRow } from "@/lib/reports/daily";
import { formatThaiTime } from "@/lib/format";

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

> Note: `createClient` and `formatStudentName` are already imported at the top of the file. Add the three new imports (`bangkokDateKey`, `groupDailyRevenue`/`DailyRevenueRow`, `formatThaiTime`) to the existing import block at the top instead of mid-file if your linter requires it.

- [ ] **Step 2: Type-check**

Run: `yarn build` (or `npx tsc --noEmit`)
Expected: no type errors in `reports.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/reports.ts
git commit -m "feat: add fetchDailyRevenue query"
```

---

## Task 4: Print CSS, ReportLetterhead, ReportToolbar

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/finance/report-letterhead.tsx`
- Create: `src/components/finance/report-toolbar.tsx`

- [ ] **Step 1: Add print styles**

Append to `src/app/globals.css`:

```css
@media print {
  aside,
  header.sticky,
  .report-toolbar {
    display: none !important;
  }
  .report-letterhead {
    display: block !important;
  }
  main {
    padding: 0 !important;
  }
  .report-room-group {
    break-before: page;
  }
  .report-room-group:first-of-type {
    break-before: auto;
  }
}
```

- [ ] **Step 2: Create ReportLetterhead**

Create `src/components/finance/report-letterhead.tsx`:

```tsx
import Image from "next/image";
import { formatThaiDateLong } from "@/lib/format";

type ReportLetterheadProps = {
  title: string;
  yearName?: string;
  semesterNumber?: number;
  subtitle?: string;
};

export function ReportLetterhead({
  title,
  yearName,
  semesterNumber,
  subtitle,
}: ReportLetterheadProps) {
  return (
    <div className="report-letterhead hidden mb-4 border-b border-black pb-3 print:block">
      <div className="flex items-center gap-3">
        <Image src="/school-logo.png" alt="โลโก้โรงเรียน" width={56} height={56} className="rounded-full" />
        <div>
          <p className="text-lg font-bold">โรงเรียนบัวใหญ่วิทยา</p>
          <p className="text-sm">อ.บัวใหญ่ จ.นครราชสีมา</p>
        </div>
      </div>
      <div className="mt-2">
        <p className="text-base font-semibold">{title}</p>
        {yearName ? (
          <p className="text-sm">
            ภาคเรียนที่ {semesterNumber ?? 1} · ปีการศึกษา {yearName}
          </p>
        ) : null}
        {subtitle ? <p className="text-sm">{subtitle}</p> : null}
        <p className="text-xs text-gray-600">พิมพ์เมื่อ {formatThaiDateLong(new Date())}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ReportToolbar**

Create `src/components/finance/report-toolbar.tsx`:

```tsx
"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportToolbar() {
  return (
    <div className="report-toolbar flex justify-end">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" />
        พิมพ์
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `yarn build`
Expected: no type errors. (Confirm `Printer` exists in `lucide-react` — it does.)

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/finance/report-letterhead.tsx src/components/finance/report-toolbar.tsx
git commit -m "feat: add print styles, report letterhead, and print toolbar"
```

---

## Task 5: Daily revenue page + panel

**Files:**
- Create: `src/components/finance/daily-revenue-panel.tsx`
- Create: `src/app/(dashboard)/reports/daily/page.tsx`

- [ ] **Step 1: Create the panel**

Create `src/components/finance/daily-revenue-panel.tsx`:

```tsx
"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchDailyRevenue } from "@/lib/queries/reports";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht, formatThaiDate } from "@/lib/format";

const METHOD_ITEMS = [
  { value: "all", label: "ทุกวิธี" },
  { value: "cash", label: "เงินสด" },
  { value: "transfer", label: "เงินโอน" },
];

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DailyRevenuePanel() {
  useRequireRole(["admin", "finance"]);

  const { ctx } = useSemesterContext();
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [method, setMethod] = useState<"all" | "cash" | "transfer">("all");
  const [openDate, setOpenDate] = useState<string | null>(null);

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

  const summary = data?.summary ?? [];
  const receiptsByDate = data?.receiptsByDate ?? {};

  const totals = summary.reduce(
    (acc, r) => ({
      receiptCount: acc.receiptCount + r.receiptCount,
      cashTotal: acc.cashTotal + r.cashTotal,
      transferTotal: acc.transferTotal + r.transferTotal,
      total: acc.total + r.total,
    }),
    { receiptCount: 0, cashTotal: 0, transferTotal: 0, total: 0 },
  );

  return (
    <>
      <AppHeader title="รายรับรายวัน" basePath="/reports/daily" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead
          title="รายงานรายรับรายวัน"
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
            <Select value={method} onValueChange={(v) => setMethod((v ?? "all") as typeof method)} items={METHOD_ITEMS}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="วิธีจ่าย" />
              </SelectTrigger>
              <SelectContent>
                {METHOD_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <ReportToolbar />
            </div>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : summary.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead className="text-right">จำนวนใบเสร็จ</TableHead>
                  <TableHead className="text-right">เงินสด</TableHead>
                  <TableHead className="text-right">เงินโอน</TableHead>
                  <TableHead className="text-right">รวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((row) => (
                  <Fragment key={row.dateKey}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setOpenDate(openDate === row.dateKey ? null : row.dateKey)}
                    >
                      <TableCell className="font-medium">
                        {formatThaiDate(`${row.dateKey}T00:00:00+07:00`)}
                        {row.voidedCount > 0 ? (
                          <Badge variant="outline" className="ml-2 text-xs">
                            ยกเลิก {row.voidedCount}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.receiptCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.cashTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.transferTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatBaht(row.total)}</TableCell>
                    </TableRow>
                    {openDate === row.dateKey
                      ? (receiptsByDate[row.dateKey] ?? []).map((rec) => (
                          <TableRow key={rec.paymentId} className="bg-muted/40 text-sm">
                            <TableCell className="pl-8">
                              {rec.timeLabel} · {rec.receiptNumber}
                              {rec.status === "voided" ? (
                                <Badge variant="outline" className="ml-2 text-xs text-red-600">ยกเลิก</Badge>
                              ) : null}
                            </TableCell>
                            <TableCell colSpan={2}>
                              {rec.studentName} ({rec.studentCode})
                            </TableCell>
                            <TableCell className="text-right">
                              {rec.paymentMethod === "cash" ? "เงินสด" : "เงินโอน"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatBaht(rec.amount)}</TableCell>
                          </TableRow>
                        ))
                      : null}
                  </Fragment>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>รวมทั้งช่วง</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.receiptCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(totals.cashTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(totals.transferTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(totals.total)}</TableCell>
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

- [ ] **Step 2: Create the page**

Create `src/app/(dashboard)/reports/daily/page.tsx`:

```tsx
import { DailyRevenuePanel } from "@/components/finance/daily-revenue-panel";

export default function DailyRevenuePage() {
  return <DailyRevenuePanel />;
}
```

- [ ] **Step 3: Type-check + manual verify**

Run: `yarn build`
Then `yarn dev`, log in as admin/finance, visit `/reports/daily`:
- Date range defaults to current month; rows show one per day with cash/transfer/total.
- Clicking a day expands its receipts; voided rows are flagged and excluded from totals.
- Bottom row shows period totals.
- Print preview (Ctrl+P) shows the letterhead and hides sidebar/header/toolbar.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/daily-revenue-panel.tsx "src/app/(dashboard)/reports/daily/page.tsx"
git commit -m "feat: add daily revenue report page"
```

---

## Task 6: Sidebar navigation

**Files:**
- Modify: `src/components/app-sidebar.tsx:30-37` (financeNav) and `:84-86` (teacherNav)

- [ ] **Step 1: Update financeNav**

Replace the `financeNav` array (lines 30-37) so the report entries read:

```tsx
const financeNav = [
  { href: "/fee-rates", label: "ตั้งค่าค่าธรรมเนียม", icon: SlidersHorizontal },
  { href: "/receipt-types", label: "ประเภทใบเสร็จ", icon: Receipt },
  { href: "/invoices", label: "ใบแจ้งชำระ", icon: FileText },
  { href: "/payments", label: "บันทึกการจ่าย", icon: CreditCard },
  { href: "/reports/daily", label: "รายรับรายวัน", icon: ChartColumn },
  { href: "/reports/outstanding", label: "รายงานค้างชำระ", icon: ChartColumn },
  { href: "/reports/collections", label: "สถิติการเก็บ", icon: ChartColumn },
  { href: "/reports/students", label: "รายบุคคล", icon: Users },
];
```

- [ ] **Step 2: Update teacherNav**

Replace the `teacherNav` array (lines 84-86):

```tsx
const teacherNav = [
  { href: "/reports/outstanding", label: "รายงานค้างชำระ", icon: ChartColumn },
  { href: "/reports/collections", label: "สถิติการเก็บ", icon: ChartColumn },
  { href: "/reports/students", label: "รายบุคคล", icon: Users },
];
```

> `Users` and `ChartColumn` are already imported at the top of the file.

- [ ] **Step 3: Manual verify + commit**

`yarn dev`: sidebar shows the 4 report links for admin/finance, and teacher sees the 3 allowed links (no daily revenue).

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: add report links to sidebar nav"
```

---

## Task 7: Outstanding report — group-by-room view

**Files:**
- Modify: `src/components/finance/outstanding-report-panel.tsx`

- [ ] **Step 1: Add a view Select + grouping**

In `src/components/finance/outstanding-report-panel.tsx`:

1. Add imports near the top:

```tsx
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
```

2. Add a view constant near `STATUS_ITEMS` (line 30):

```tsx
const VIEW_ITEMS = [
  { value: "list", label: "ตามรายชื่อ" },
  { value: "byRoom", label: "จัดกลุ่มตามห้อง" },
];
```

3. Read the view from search params (next to `variantParam`, ~line 57):

```tsx
const viewParam = searchParams.get("view") === "byRoom" ? "byRoom" : "list";
```

4. Add `view` into the `params` object and `pushParams` handling (mirror the existing keys — when `view !== "list"` set it, else delete it).

5. Add the Select control inside the filter row (after the variant Select, ~line 206):

```tsx
<Select
  value={viewParam}
  onValueChange={(v) => pushParams({ view: (v ?? "list") })}
  items={VIEW_ITEMS}
>
  <SelectTrigger className="w-[170px]">
    <SelectValue placeholder="มุมมอง" />
  </SelectTrigger>
  <SelectContent>
    {VIEW_ITEMS.map((item) => (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

6. Add `<ReportToolbar />` at the end of the filter row, and add `<ReportLetterhead title="รายงานลูกหนี้ค้างชำระ" yearName={ctx?.academicYearName} semesterNumber={ctx?.semesterNumber} />` directly after `<main ...>` opens. Wrap the existing filter row container with `className="report-toolbar ..."` so it hides on print.

- [ ] **Step 2: Render grouped-by-room view**

Below the existing desktop table block, add a grouped renderer used when `viewParam === "byRoom"`. Add this helper inside the component (before `return`):

```tsx
const groupedByRoom = (() => {
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.gradeClassroom;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
})();
```

Then gate the rendering: when `viewParam === "byRoom"`, render the grouped markup instead of the flat desktop table:

```tsx
{viewParam === "byRoom" ? (
  <div className="hidden sm:block space-y-6">
    {groupedByRoom.map(([room, roomRows]) => {
      const roomOutstanding = roomRows.reduce((s, r) => s + r.outstanding, 0);
      return (
        <div key={room} className="report-room-group">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">{room}</h3>
            <span className="text-sm text-muted-foreground tabular-nums">
              ค้างรวม {formatBaht(roomOutstanding)}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อ-นามสกุล</TableHead>
                <TableHead className="text-right">ต้องชำระ</TableHead>
                <TableHead className="text-right">ชำระแล้ว</TableHead>
                <TableHead className="text-right">ค้าง</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roomRows.map((row) => (
                <TableRow key={row.studentId}>
                  <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                  <TableCell>{row.studentName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(row.totalAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(row.paidAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatBaht(row.outstanding)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    })}
  </div>
) : (
  /* existing flat desktop table block stays here */
)}
```

Keep the existing mobile card block unchanged (used for both views).

- [ ] **Step 3: Type-check + manual verify**

Run: `yarn build`, then `yarn dev` → `/reports/outstanding`:
- "ตามรายชื่อ" shows the original flat table.
- "จัดกลุ่มตามห้อง" groups rows under each room header with a per-room outstanding total.
- Print preview shows letterhead, each room starts on a new page, sidebar/filters hidden.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/outstanding-report-panel.tsx
git commit -m "feat: add group-by-room view and print to outstanding report"
```

---

## Task 8: Collections — by-classroom and summary queries

**Files:**
- Modify: `src/lib/queries/reports.ts`

- [ ] **Step 1: Add `CollectionsSummary` type + `fetchCollectionsSummary`**

Add to `src/lib/queries/reports.ts`:

```ts
export type CollectionsSummary = {
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  outstanding: number;
  ratePercent: number;
};

export async function fetchCollectionsSummary(
  semesterId: string,
  academicYearId: string,
  teacherProfileId?: string,
): Promise<CollectionsSummary> {
  const rows = await fetchCollectionsByClassroom(semesterId, academicYearId, teacherProfileId);
  const totalDue = rows.reduce((s, r) => s + r.totalDue, 0);
  const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
  const studentCount = rows.reduce((s, r) => s + r.studentCount, 0);
  return {
    studentCount,
    totalDue: round2(totalDue),
    totalPaid: round2(totalPaid),
    outstanding: round2(totalDue - totalPaid),
    ratePercent: totalDue > 0 ? round2((totalPaid / totalDue) * 100) : 0,
  };
}
```

- [ ] **Step 2: Add `ClassroomCollectionsRow` type + `fetchCollectionsByClassroom`**

```ts
export type ClassroomCollectionsRow = {
  classroomLabel: string;
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  ratePercent: number;
};

export async function fetchCollectionsByClassroom(
  semesterId: string,
  academicYearId: string,
  teacherProfileId?: string,
): Promise<ClassroomCollectionsRow[]> {
  const supabase = createClient();

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name, grade_levels ( name, sort_order )")
    .eq("semester_id", semesterId);

  type ClassroomRow = {
    id: string;
    name: string;
    grade_levels: { name: string; sort_order: number } | null;
  };
  let list = (classrooms ?? []) as unknown as ClassroomRow[];

  if (teacherProfileId) {
    const { data: assignments } = await supabase
      .from("teacher_assignments")
      .select("classroom_id")
      .eq("profile_id", teacherProfileId)
      .eq("semester_id", semesterId);
    const allowed = new Set((assignments ?? []).map((a) => a.classroom_id));
    list = list.filter((c) => allowed.has(c.id));
  }

  list.sort((a, b) => {
    const so = (a.grade_levels?.sort_order ?? 0) - (b.grade_levels?.sort_order ?? 0);
    return so !== 0 ? so : a.name.localeCompare(b.name, "th");
  });

  const results: ClassroomCollectionsRow[] = [];

  for (const classroom of list) {
    const label = `${classroom.grade_levels?.name ?? ""}/${classroom.name}`;

    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("semester_id", semesterId)
      .eq("status", "enrolled")
      .eq("classroom_id", classroom.id);

    const studentIds = (enrollments ?? []).map((e) => e.student_id);
    if (studentIds.length === 0) {
      results.push({ classroomLabel: label, studentCount: 0, totalDue: 0, totalPaid: 0, ratePercent: 0 });
      continue;
    }

    const { data: invoices } = await supabase
      .from("student_invoices")
      .select("total_amount, paid_amount")
      .eq("academic_year_id", academicYearId)
      .eq("semester_id", semesterId)
      .in("student_id", studentIds);

    const totalDue = (invoices ?? []).reduce((s, i) => s + Number(i.total_amount), 0);
    const totalPaid = (invoices ?? []).reduce((s, i) => s + Number(i.paid_amount), 0);
    results.push({
      classroomLabel: label,
      studentCount: studentIds.length,
      totalDue: round2(totalDue),
      totalPaid: round2(totalPaid),
      ratePercent: totalDue > 0 ? round2((totalPaid / totalDue) * 100) : 0,
    });
  }

  return results;
}
```

> `fetchCollectionsSummary` calls `fetchCollectionsByClassroom`, so define `fetchCollectionsByClassroom` above it (or hoist via `function` declarations — both are function declarations, so order in the module does not matter for hoisting). `round2` and `createClient` already exist in this file.

- [ ] **Step 3: Type-check + commit**

Run: `yarn build`
Expected: no type errors.

```bash
git add src/lib/queries/reports.ts
git commit -m "feat: add collections by-classroom and summary queries"
```

---

## Task 9: Collections panel — level select + print

**Files:**
- Modify: `src/components/finance/collections-report-panel.tsx`

- [ ] **Step 1: Add level state, queries, imports**

Rewrite `src/components/finance/collections-report-panel.tsx` to add a level selector. Add imports:

```tsx
import { useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import {
  fetchCollectionsByGrade,
  fetchCollectionsByClassroom,
  fetchCollectionsSummary,
} from "@/lib/queries/reports";
```

Add level constant and state:

```tsx
const LEVEL_ITEMS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "grade", label: "ตามชั้น" },
  { value: "classroom", label: "ตามห้อง" },
];
```

```tsx
const [level, setLevel] = useState<"all" | "grade" | "classroom">("grade");
```

Add the two extra queries alongside the existing grade query (enable only when relevant):

```tsx
const { data: classroomRows = [] } = useQuery({
  queryKey: ["collections-by-classroom", ctx?.semesterId, ctx?.academicYearId, teacherProfileId],
  queryFn: () => fetchCollectionsByClassroom(ctx!.semesterId, ctx!.academicYearId, teacherProfileId),
  enabled: !!ctx && level === "classroom",
});

const { data: summary } = useQuery({
  queryKey: ["collections-summary", ctx?.semesterId, ctx?.academicYearId, teacherProfileId],
  queryFn: () => fetchCollectionsSummary(ctx!.semesterId, ctx!.academicYearId, teacherProfileId),
  enabled: !!ctx && level === "all",
});
```

- [ ] **Step 2: Render by level**

Add the toolbar row (level Select + `ReportToolbar`) and the letterhead inside `<main>`, then branch on `level`:

- `level === "all"`: render summary cards:

```tsx
<div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
  <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">นักเรียนทั้งหมด</p><p className="text-2xl font-semibold tabular-nums">{summary?.studentCount ?? 0}</p></CardContent></Card>
  <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ยอดที่ต้องเก็บ</p><p className="text-2xl font-semibold tabular-nums">{formatBaht(summary?.totalDue ?? 0)}</p></CardContent></Card>
  <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">เก็บได้</p><p className="text-2xl font-semibold tabular-nums">{formatBaht(summary?.totalPaid ?? 0)}</p></CardContent></Card>
  <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">อัตราเก็บได้</p><p className="text-2xl font-semibold tabular-nums">{summary?.ratePercent ?? 0}%</p></CardContent></Card>
</div>
```

- `level === "grade"`: keep the existing grade table (uses `rows` from `fetchCollectionsByGrade`).
- `level === "classroom"`: render the same table shape but iterate `classroomRows`, with first column `row.classroomLabel` and the same numeric columns.

Wrap the filter/level row container with `className="report-toolbar ..."`, and put `<ReportLetterhead title="สถิติการเก็บเงิน" yearName={ctx?.academicYearName} semesterNumber={ctx?.semesterNumber} />` right after `<main>` opens.

- [ ] **Step 3: Type-check + manual verify**

Run: `yarn build`, then `yarn dev` → `/reports/collections`:
- "ทั้งหมด" shows 4 summary cards.
- "ตามชั้น" shows the original per-grade table.
- "ตามห้อง" shows per-classroom rows (ป.1/1, ป.1/2, ...).
- Print preview shows letterhead, hides sidebar/toolbar.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/collections-report-panel.tsx
git commit -m "feat: add level select (all/grade/classroom) and print to collections"
```

---

## Task 10: Student roster query + page

**Files:**
- Modify: `src/lib/queries/reports.ts`
- Create: `src/components/finance/student-roster-panel.tsx`
- Create: `src/app/(dashboard)/reports/students/page.tsx`

- [ ] **Step 1: Add `fetchStudentRoster`**

The outstanding query already returns per-student totals. Add a roster query that returns ALL students (not just debtors) by reusing the invoice shape. Add to `src/lib/queries/reports.ts`:

```ts
export type StudentRosterRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
};

export async function fetchStudentRoster(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  query?: string;
  teacherProfileId?: string;
}): Promise<StudentRosterRow[]> {
  // Reuse the outstanding query plumbing but without forcing unpaid/partial.
  const rows = await fetchOutstandingReport({
    semesterId: params.semesterId,
    academicYearId: params.academicYearId,
    gradeLevelId: params.gradeLevelId,
    classroomId: params.classroomId,
    status: params.status ?? "all",
    variant: "all",
    teacherProfileId: params.teacherProfileId,
  });

  const q = params.query?.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.studentName.toLowerCase().includes(q) ||
          r.studentCode.toLowerCase().includes(q),
      )
    : rows;

  return filtered.map((r) => ({
    studentId: r.studentId,
    studentCode: r.studentCode,
    studentName: r.studentName,
    gradeClassroom: r.gradeClassroom,
    totalAmount: r.totalAmount,
    paidAmount: r.paidAmount,
    outstanding: r.outstanding,
    status: r.status,
  }));
}
```

> Important: `fetchOutstandingReport` with `status: "all"` currently filters to `["unpaid","partial"]` only when status is the default — re-check its branch. In `fetchOutstandingReport`, the `else` branch (when `status === "all"`) restricts to `["unpaid","partial"]`. To get the full roster, pass `status: "paid"` won't help. **Therefore:** add a new param `includeAllStatuses?: boolean` to `fetchOutstandingReport` that, when true, skips the status `.in(...)` restriction entirely, and have `fetchStudentRoster` pass it. Update the status branch:
>
> ```ts
> if (params.status && params.status !== "all") {
>   query = query.eq("status", params.status);
> } else if (!params.includeAllStatuses) {
>   query = query.in("status", ["unpaid", "partial"]);
> }
> ```
>
> Add `includeAllStatuses?: boolean;` to the `fetchOutstandingReport` params type, and in `fetchStudentRoster` call it with `includeAllStatuses: true` and drop the `status: params.status ?? "all"` override (pass `status: params.status` through, plus `includeAllStatuses: true`).

- [ ] **Step 2: Create the roster panel**

Create `src/components/finance/student-roster-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchStudentRoster } from "@/lib/queries/reports";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { formatBaht } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/finance/constants";

const STATUS_ITEMS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "unpaid", label: "ค้างชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
  { value: "paid", label: "ชำระครบ" },
];

export function StudentRosterPanel() {
  useRequireRole(["admin", "finance", "teacher"]);
  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const teacherProfileId = profile?.role === "teacher" ? profile.id : undefined;

  const [grade, setGrade] = useState("all");
  const [classroom, setClassroom] = useState("all");
  const [status, setStatus] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["student-roster", ctx?.semesterId, ctx?.academicYearId, grade, classroom, status, search, teacherProfileId],
    queryFn: () =>
      fetchStudentRoster({
        semesterId: ctx!.semesterId,
        academicYearId: ctx!.academicYearId,
        gradeLevelId: grade !== "all" ? grade : undefined,
        classroomId: classroom !== "all" ? classroom : undefined,
        status,
        query: search,
        teacherProfileId,
      }),
    enabled: !!ctx,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["grade-levels", ctx?.semesterId],
    queryFn: () => fetchGradeLevels(ctx!.semesterId),
    enabled: !!ctx,
  });
  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", ctx?.semesterId],
    queryFn: () => fetchClassroomsBySemester(ctx!.semesterId),
    enabled: !!ctx,
  });

  const gradeItems = [{ value: "all", label: "ทุกชั้น" }, ...grades.map((g) => ({ value: g.id, label: g.name }))];
  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => grade === "all" || c.grade_level_id === grade)
      .map((c) => ({ value: c.id, label: `${grades.find((g) => g.id === c.grade_level_id)?.name ?? ""}/${c.name}` })),
  ];

  return (
    <>
      <AppHeader title="รายงานรายบุคคล" basePath="/reports/students" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead title="รายงานสรุปรายบุคคล" yearName={ctx?.academicYearName} semesterNumber={ctx?.semesterNumber} />
        <div className="space-y-4">
          <div className="report-toolbar flex flex-wrap items-center gap-2">
            <Select value={grade} onValueChange={(v) => { setGrade(v ?? "all"); setClassroom("all"); }} items={gradeItems}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="ชั้น" /></SelectTrigger>
              <SelectContent>{gradeItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={classroom} onValueChange={(v) => setClassroom(v ?? "all")} items={classroomItems}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="ห้อง" /></SelectTrigger>
              <SelectContent>{classroomItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus((v ?? "all") as typeof status)} items={STATUS_ITEMS}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="สถานะ" /></SelectTrigger>
              <SelectContent>{STATUS_ITEMS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="ค้นหาชื่อ/รหัส" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
            <div className="ml-auto"><ReportToolbar /></div>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบนักเรียน</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ-นามสกุล</TableHead>
                  <TableHead>ชั้น/ห้อง</TableHead>
                  <TableHead className="text-right">ต้องชำระ</TableHead>
                  <TableHead className="text-right">ชำระแล้ว</TableHead>
                  <TableHead className="text-right">ค้าง</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.studentId} className="cursor-pointer">
                    <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                    <TableCell>
                      <Link href={`/reports/students/${row.studentId}`} className="hover:underline">
                        {row.studentName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.gradeClassroom}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(row.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(row.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatBaht(row.outstanding)}</TableCell>
                    <TableCell><Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 2b: Create the page**

Create `src/app/(dashboard)/reports/students/page.tsx`:

```tsx
import { StudentRosterPanel } from "@/components/finance/student-roster-panel";

export default function StudentRosterPage() {
  return <StudentRosterPanel />;
}
```

- [ ] **Step 3: Type-check + manual verify**

Run: `yarn build`, then `/reports/students`: filters work, search filters by name/code, clicking a name routes to `/reports/students/<id>` (404 until Task 11). Teacher sees only their rooms.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/reports.ts src/components/finance/student-roster-panel.tsx "src/app/(dashboard)/reports/students/page.tsx"
git commit -m "feat: add per-student roster report"
```

---

## Task 11: Student statement query + page

**Files:**
- Modify: `src/lib/queries/reports.ts`
- Create: `src/components/finance/student-statement-panel.tsx`
- Create: `src/app/(dashboard)/reports/students/[studentId]/page.tsx`

- [ ] **Step 1: Add `fetchStudentStatement`**

Add to `src/lib/queries/reports.ts`:

```ts
import { formatThaiDate } from "@/lib/format";

export type StatementLine = { description: string; amount: number };
export type StatementPayment = {
  paidAt: string;
  dateLabel: string;
  receiptNumber: string;
  method: "cash" | "transfer";
  amount: number;
  status: "active" | "voided";
};
export type StudentStatement = {
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  lines: StatementLine[];
  payments: StatementPayment[];
  totalDue: number;
  totalPaid: number;
  outstanding: number;
};

export async function fetchStudentStatement(
  studentId: string,
  semesterId: string,
  academicYearId: string,
): Promise<StudentStatement | null> {
  const supabase = createClient();
  const gradeByStudent = await getStudentGradeMap(semesterId);

  const { data: student } = await supabase
    .from("students")
    .select("student_code, first_name, last_name")
    .eq("id", studentId)
    .single();
  if (!student) return null;

  const { data: invoices } = await supabase
    .from("student_invoices")
    .select("id, total_amount, paid_amount, invoice_lines ( description, amount )")
    .eq("student_id", studentId)
    .eq("academic_year_id", academicYearId)
    .eq("semester_id", semesterId);

  type InvoiceRow = {
    id: string;
    total_amount: number;
    paid_amount: number;
    invoice_lines: { description: string; amount: number }[];
  };
  const invoiceRows = (invoices ?? []) as unknown as InvoiceRow[];

  const lines: StatementLine[] = invoiceRows.flatMap((inv) =>
    inv.invoice_lines.map((l) => ({ description: l.description, amount: Number(l.amount) })),
  );
  const totalDue = invoiceRows.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = invoiceRows.reduce((s, i) => s + Number(i.paid_amount), 0);

  const { data: payments } = await supabase
    .from("payments")
    .select("receipt_number, payment_method, amount, paid_at, status")
    .eq("student_id", studentId)
    .eq("academic_year_id", academicYearId)
    .order("paid_at", { ascending: true });

  type PayRow = {
    receipt_number: string;
    payment_method: "cash" | "transfer";
    amount: number;
    paid_at: string;
    status: "active" | "voided";
  };
  const paymentRows = ((payments ?? []) as unknown as PayRow[]).map((p) => ({
    paidAt: p.paid_at,
    dateLabel: formatThaiDate(p.paid_at),
    receiptNumber: p.receipt_number,
    method: p.payment_method,
    amount: Number(p.amount),
    status: p.status,
  }));

  return {
    studentCode: student.student_code,
    studentName: formatStudentName(student.first_name, student.last_name),
    gradeClassroom: gradeByStudent.get(studentId) ?? "—",
    lines,
    payments: paymentRows,
    totalDue: round2(totalDue),
    totalPaid: round2(totalPaid),
    outstanding: round2(totalDue - totalPaid),
  };
}
```

> `getStudentGradeMap` is the inline browser-client version already defined at the top of `reports.ts` (lines 35-67). `formatThaiDate` import: add to the top import block if not already present.

- [ ] **Step 2: Create the statement panel**

Create `src/components/finance/student-statement-panel.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchStudentStatement } from "@/lib/queries/reports";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { formatBaht } from "@/lib/format";

export function StudentStatementPanel({ studentId }: { studentId: string }) {
  useRequireRole(["admin", "finance", "teacher"]);
  const { ctx } = useSemesterContext();

  const { data: s, isLoading } = useQuery({
    queryKey: ["student-statement", studentId, ctx?.semesterId, ctx?.academicYearId],
    queryFn: () => fetchStudentStatement(studentId, ctx!.semesterId, ctx!.academicYearId),
    enabled: !!ctx,
  });

  return (
    <>
      <AppHeader title="ใบแจ้งยอดรายบุคคล" basePath="/reports/students" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead
          title="ใบแจ้งยอดค่าใช้จ่ายนักเรียน"
          yearName={ctx?.academicYearName}
          semesterNumber={ctx?.semesterNumber}
          subtitle={s ? `${s.studentName} (${s.studentCode}) · ${s.gradeClassroom}` : undefined}
        />
        <div className="report-toolbar mb-4 flex justify-end"><ReportToolbar /></div>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : !s ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบข้อมูลนักเรียน</p>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-border p-4 print:border-black">
              <p className="text-lg font-semibold">{s.studentName}</p>
              <p className="text-sm text-muted-foreground">{s.studentCode} · {s.gradeClassroom}</p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">ค่าใช้จ่าย</h3>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>รายการ</TableHead><TableHead className="text-right">จำนวนเงิน</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {s.lines.map((l, i) => (
                    <TableRow key={i}><TableCell>{l.description}</TableCell><TableCell className="text-right tabular-nums">{formatBaht(l.amount)}</TableCell></TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold"><TableCell>รวมต้องชำระ</TableCell><TableCell className="text-right tabular-nums">{formatBaht(s.totalDue)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">ประวัติการชำระ</h3>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>วันที่</TableHead><TableHead>เลขที่ใบเสร็จ</TableHead><TableHead>วิธี</TableHead><TableHead className="text-right">ยอด</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {s.payments.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-4 text-center text-muted-foreground">ยังไม่มีการชำระ</TableCell></TableRow>
                  ) : (
                    s.payments.map((p, i) => (
                      <TableRow key={i} className={p.status === "voided" ? "text-red-600 line-through" : ""}>
                        <TableCell>{p.dateLabel}</TableCell>
                        <TableCell>
                          {p.receiptNumber}
                          {p.status === "voided" ? <Badge variant="outline" className="ml-2 text-xs">ยกเลิก</Badge> : null}
                        </TableCell>
                        <TableCell>{p.method === "cash" ? "เงินสด" : "เงินโอน"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBaht(p.amount)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><span>รวมต้องชำระ</span><span className="tabular-nums">{formatBaht(s.totalDue)}</span></div>
                <div className="flex justify-between"><span>ชำระแล้ว</span><span className="tabular-nums">{formatBaht(s.totalPaid)}</span></div>
                <div className="flex justify-between border-t pt-1 font-semibold"><span>คงค้าง</span><span className="tabular-nums">{formatBaht(s.outstanding)}</span></div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 2b: Create the dynamic page**

Create `src/app/(dashboard)/reports/students/[studentId]/page.tsx`:

```tsx
import { StudentStatementPanel } from "@/components/finance/student-statement-panel";

export default async function StudentStatementPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return <StudentStatementPanel studentId={studentId} />;
}
```

> Next.js 16 passes `params` as a Promise in server components — the `await params` form above is required.

- [ ] **Step 3: Type-check + manual verify**

Run: `yarn build`, then from `/reports/students` click a student → statement shows fee lines, payment history (voided struck through), and totals. Print preview shows the letterhead with the student subtitle.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/reports.ts src/components/finance/student-statement-panel.tsx "src/app/(dashboard)/reports/students/[studentId]/page.tsx"
git commit -m "feat: add per-student statement report"
```

---

## Task 12: Full verification pass

- [ ] **Step 1: Run the whole test suite**

Run: `yarn test`
Expected: all pass, including the new `date.test.ts` and `daily.test.ts`.

- [ ] **Step 2: Lint + build**

Run: `yarn lint && yarn build`
Expected: no errors.

- [ ] **Step 3: Manual smoke test in browser**

`yarn dev`, then for an **admin/finance** account:
- `/reports/daily` — date range, method filter, expand a day, totals row, void flagging, print preview.
- `/reports/outstanding` — both views; group-by-room print breaks per room.
- `/reports/collections` — all/grade/classroom; summary cards in "ทั้งหมด".
- `/reports/students` — filters + search; click through to statement.

For a **teacher** account:
- No `รายรับรายวัน` link in the sidebar; navigating to `/reports/daily` is blocked by `useRequireRole`.
- Outstanding/collections/students show only the teacher's assigned rooms.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: reporting system verification fixes"
```

---

## Notes for the implementer

- **Patterns to follow:** existing report panels (`outstanding-report-panel.tsx`, `collections-report-panel.tsx`) are the canonical reference for client-component + react-query + `Select` usage.
- **Auth:** `useRequireRole([...])` from `@/components/providers/auth-provider`; teacher scoping is done by passing `teacherProfileId` into the query (see `fetchOutstandingReport`).
- **Money:** always `formatBaht()`; keep `round2` for arithmetic.
- **Do not** add Excel/CSV export — printing to PDF via `window.print()` is the only export path per the spec.
