# Student Statement All-Years View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "ทุกปีการศึกษา" toggle to the individual student statement page so users can see invoices and payments across all academic years in one view.

**Architecture:** Extend `StatementLine` and `StatementPayment` types with an optional `yearLabel` field. Add a new query `fetchStudentStatementAllYears` that fetches without year/semester filters and attaches year labels. Wire a mode toggle in `StudentStatementPanel` that switches between the existing semester query and the new all-years query, showing an extra "ปี/ภาค" column when in all-years mode.

**Tech Stack:** Next.js 14, TanStack Query, Supabase JS client (`@supabase/ssr`), TypeScript

---

### Task 1: Extend types and add `fetchStudentStatementAllYears` query

**Files:**
- Modify: `src/lib/queries/reports.ts`

- [ ] **Step 1: Extend `StatementLine` and `StatementPayment` types**

In `src/lib/queries/reports.ts`, change:

```ts
export type StatementLine = { description: string; amount: number };
export type StatementPayment = {
  paidAt: string;
  dateLabel: string;
  receiptNumber: string;
  method: "cash" | "transfer";
  amount: number;
  status: "active" | "voided";
};
```

to:

```ts
export type StatementLine = {
  description: string;
  amount: number;
  yearLabel?: string;
};
export type StatementPayment = {
  paidAt: string;
  dateLabel: string;
  receiptNumber: string;
  method: "cash" | "transfer";
  amount: number;
  status: "active" | "voided";
  yearLabel?: string;
};
```

- [ ] **Step 2: Add `fetchStudentStatementAllYears` function at the bottom of `src/lib/queries/reports.ts`**

```ts
export async function fetchStudentStatementAllYears(
  studentId: string,
): Promise<StudentStatement | null> {
  const supabase = createClient();

  const { data: student } = await supabase
    .from("students")
    .select("student_code, first_name, last_name")
    .eq("id", studentId)
    .single();
  if (!student) return null;

  // Fetch invoices across all years, joining semester and academic year for labels
  const { data: invoices } = await supabase
    .from("student_invoices")
    .select(
      `id, total_amount, paid_amount,
       invoice_lines ( description, amount ),
       semesters ( number, academic_years ( name ) )`,
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  type InvoiceRowAll = {
    id: string;
    total_amount: number;
    paid_amount: number;
    invoice_lines: { description: string; amount: number }[];
    semesters: { number: number; academic_years: { name: string } | null } | null;
  };
  const invoiceRows = (invoices ?? []) as unknown as InvoiceRowAll[];

  const lines: StatementLine[] = invoiceRows.flatMap((inv) => {
    const sem = inv.semesters;
    const yearLabel = sem
      ? `${sem.academic_years?.name ?? "?"} ภาค ${sem.number}`
      : undefined;
    return (inv.invoice_lines ?? []).map((l) => ({
      description: l.description,
      amount: Number(l.amount),
      yearLabel,
    }));
  });

  const totalDue = invoiceRows.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = invoiceRows.reduce((s, i) => s + Number(i.paid_amount), 0);

  // Fetch payments across all years
  const { data: payments } = await supabase
    .from("payments")
    .select(
      `receipt_number, payment_method, amount, paid_at, status,
       semesters ( number, academic_years ( name ) )`,
    )
    .eq("student_id", studentId)
    .order("paid_at", { ascending: true });

  type PayRowAll = {
    receipt_number: string;
    payment_method: "cash" | "transfer";
    amount: number;
    paid_at: string;
    status: "active" | "voided";
    semesters: { number: number; academic_years: { name: string } | null } | null;
  };
  const paymentRows = ((payments ?? []) as unknown as PayRowAll[]).map((p) => {
    const sem = p.semesters;
    return {
      paidAt: p.paid_at,
      dateLabel: formatThaiDate(p.paid_at),
      receiptNumber: p.receipt_number,
      method: p.payment_method,
      amount: Number(p.amount),
      status: p.status,
      yearLabel: sem
        ? `${sem.academic_years?.name ?? "?"} ภาค ${sem.number}`
        : undefined,
    };
  });

  // Best-effort: find most recent enrollment across all semesters
  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select(`classrooms ( name, grade_levels ( name ) )`)
    .eq("student_id", studentId)
    .eq("status", "enrolled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type EnrollRow = {
    classrooms: { name: string; grade_levels: { name: string } | null } | null;
  };
  const enroll = enrollment as unknown as EnrollRow | null;
  const gradeClassroom = enroll?.classrooms
    ? formatClassroom(
        enroll.classrooms.grade_levels?.name ?? null,
        enroll.classrooms.name,
      )
    : "—";

  return {
    studentCode: student.student_code,
    studentName: formatStudentName(student.first_name, student.last_name),
    gradeClassroom,
    lines,
    payments: paymentRows,
    totalDue: round2(totalDue),
    totalPaid: round2(totalPaid),
    outstanding: Math.max(0, round2(totalDue - totalPaid)),
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no output (no errors)

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/reports.ts
git commit -m "feat: add fetchStudentStatementAllYears query"
```

---

### Task 2: Update `StudentStatementPanel` with mode toggle and conditional columns

**Files:**
- Modify: `src/components/finance/student-statement-panel.tsx`

- [ ] **Step 1: Add mode toggle and conditional query**

Replace the top of `StudentStatementPanel` (the `useQuery` call and imports) as follows. The full updated file:

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import {
  fetchStudentStatement,
  fetchStudentStatementAllYears,
} from "@/lib/queries/reports";
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
  const [mode, setMode] = useState<"semester" | "all">("semester");

  const { data: s, isLoading } = useQuery({
    queryKey:
      mode === "semester"
        ? ["student-statement", studentId, ctx?.semesterId, ctx?.academicYearId]
        : ["student-statement-all-years", studentId],
    queryFn: () =>
      mode === "semester"
        ? fetchStudentStatement(studentId, ctx!.semesterId, ctx!.academicYearId)
        : fetchStudentStatementAllYears(studentId),
    enabled: mode === "all" || !!ctx,
  });

  const showYearCol = mode === "all";

  return (
    <>
      <AppHeader title="ใบแจ้งยอดรายบุคคล" basePath="/reports/students" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead
          title="ใบแจ้งยอดค่าใช้จ่ายนักเรียน"
          yearName={showYearCol ? undefined : ctx?.academicYearName}
          semesterNumber={showYearCol ? undefined : ctx?.semesterNumber}
          subtitle={s ? `${s.studentName} (${s.studentCode}) · ${s.gradeClassroom}` : undefined}
        />

        {/* Mode toggle */}
        <div className="report-toolbar mb-4 flex items-center justify-between gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              type="button"
              className={`px-4 py-2 transition-colors ${
                mode === "semester"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              onClick={() => setMode("semester")}
            >
              ปีที่เลือก
            </button>
            <button
              type="button"
              className={`px-4 py-2 transition-colors ${
                mode === "all"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              onClick={() => setMode("all")}
            >
              ทุกปีการศึกษา
            </button>
          </div>
          <ReportToolbar />
        </div>

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
                  <TableRow>
                    {showYearCol && <TableHead>ปี/ภาค</TableHead>}
                    <TableHead>รายการ</TableHead>
                    <TableHead className="text-right">จำนวนเงิน</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.lines.map((l, i) => (
                    <TableRow key={i}>
                      {showYearCol && (
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {l.yearLabel ?? "—"}
                        </TableCell>
                      )}
                      <TableCell>{l.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    {showYearCol && <TableCell />}
                    <TableCell>รวมต้องชำระ</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(s.totalDue)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">ประวัติการชำระ</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    {showYearCol && <TableHead>ปี/ภาค</TableHead>}
                    <TableHead>เลขที่ใบเสร็จ</TableHead>
                    <TableHead>วิธี</TableHead>
                    <TableHead className="text-right">ยอด</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={showYearCol ? 5 : 4} className="py-4 text-center text-muted-foreground">
                        ยังไม่มีการชำระ
                      </TableCell>
                    </TableRow>
                  ) : (
                    s.payments.map((p, i) => (
                      <TableRow key={i} className={p.status === "voided" ? "text-red-600 line-through" : ""}>
                        <TableCell>{p.dateLabel}</TableCell>
                        {showYearCol && (
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {p.yearLabel ?? "—"}
                          </TableCell>
                        )}
                        <TableCell>
                          {p.receiptNumber}
                          {p.status === "voided" ? (
                            <Badge variant="outline" className="ml-2 text-xs">ยกเลิก</Badge>
                          ) : null}
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
                <div className="flex justify-between">
                  <span>รวมต้องชำระ</span>
                  <span className="tabular-nums">{formatBaht(s.totalDue)}</span>
                </div>
                <div className="flex justify-between">
                  <span>ชำระแล้ว</span>
                  <span className="tabular-nums">{formatBaht(s.totalPaid)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>คงค้าง</span>
                  <span className="tabular-nums">{formatBaht(s.outstanding)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/student-statement-panel.tsx
git commit -m "feat: add all-years toggle to student statement panel"
```

---

### Task 3: Push

- [ ] **Step 1: Push to remote**

```bash
git push origin main
```
