# Payment CSV Backfill Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "นำเข้า CSV" button on the payments page that imports historical payments (code, amount, Buddhist-date), previews matches/validation, then commits them — issuing receipts numbered in payment-date order.

**Architecture:** Browser parses CSV and calls a preview server action for student names + outstanding totals, renders a validation table, then a commit server action re-validates and writes payments/allocations/receipts (reusing `allocatePaymentFifo`, `deriveInvoiceStatus`, `parseMaxSequence`, `formatReceiptNumber`). Pure parse/validation logic lives in a standalone module with vitest coverage.

**Tech Stack:** Next.js (App Router) server actions, Supabase, React + @base-ui dialogs, vitest.

---

## File Structure

- Create `src/lib/finance/csv-import.ts` — pure CSV parsing, Buddhist-date parsing, row assessment. No I/O.
- Create `src/lib/finance/csv-import.test.ts` — vitest unit tests for the above.
- Modify `src/lib/actions/payments.ts` — add `getImportPreviewDataAction` and `importPaymentsBackfill`.
- Create `src/components/finance/payment-import-dialog.tsx` — file picker + preview table + confirm.
- Modify `src/components/finance/payments-panel.tsx` — add the "นำเข้า CSV" button that opens the dialog.

---

## Task 1: Buddhist date parser

**Files:**
- Create: `src/lib/finance/csv-import.ts`
- Test: `src/lib/finance/csv-import.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finance/csv-import.test.ts
import { describe, expect, it } from "vitest";
import { parseBuddhistDate } from "./csv-import";

describe("parseBuddhistDate", () => {
  it("parses DD/MM/YYYY Buddhist date to ISO CE date", () => {
    expect(parseBuddhistDate("06/05/2569")).toBe("2026-05-06");
  });

  it("accepts single-digit day and month", () => {
    expect(parseBuddhistDate("6/5/2569")).toBe("2026-05-06");
  });

  it("returns null for wrong format", () => {
    expect(parseBuddhistDate("2026-05-06")).toBeNull();
  });

  it("returns null for impossible calendar date", () => {
    expect(parseBuddhistDate("31/02/2569")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseBuddhistDate("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- csv-import`
Expected: FAIL — `parseBuddhistDate` is not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/finance/csv-import.ts

/** Parse a Buddhist-era date string "DD/MM/YYYY" (e.g. "06/05/2569") to an ISO CE date "YYYY-MM-DD". Returns null if malformed or not a real calendar date. */
export function parseBuddhistDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]) - 543;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- csv-import`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/csv-import.ts src/lib/finance/csv-import.test.ts
git commit -m "feat: add Buddhist date parser for CSV import"
```

---

## Task 2: CSV row parser

**Files:**
- Modify: `src/lib/finance/csv-import.ts`
- Test: `src/lib/finance/csv-import.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/finance/csv-import.test.ts
import { parsePaymentCsv } from "./csv-import";

describe("parsePaymentCsv", () => {
  const csv = [
    "student_code,student_name,amount,paid_date",
    "14333,นาลันทา ศรีวัฒนพงศ์,3600,06/05/2569",
    "14399,อลิสา มูลทา,2000,12/05/2569",
  ].join("\n");

  it("skips the header row and parses data rows", () => {
    const rows = parsePaymentCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      studentCode: "14333",
      studentName: "นาลันทา ศรีวัฒนพงศ์",
      amount: 3600,
      paidDateIso: "2026-05-06",
      error: null,
    });
  });

  it("ignores blank lines", () => {
    expect(parsePaymentCsv(csv + "\n\n")).toHaveLength(2);
  });

  it("flags a bad amount", () => {
    const rows = parsePaymentCsv("14399,อลิสา,abc,12/05/2569");
    expect(rows[0].error).toBe("ยอดเงินไม่ถูกต้อง");
  });

  it("flags a bad date", () => {
    const rows = parsePaymentCsv("14399,อลิสา,2000,2026-05-12");
    expect(rows[0].error).toBe("วันที่ไม่ถูกต้อง");
  });

  it("strips thousands separators in amount", () => {
    const rows = parsePaymentCsv('14399,อลิสา,"1,300",12/05/2569');
    expect(rows[0].amount).toBe(1300);
    expect(rows[0].error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- csv-import`
Expected: FAIL — `parsePaymentCsv` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/lib/finance/csv-import.ts

export type ParsedCsvRow = {
  lineNumber: number;
  studentCode: string;
  studentName: string;
  amount: number;
  paidDateIso: string; // "" when the date is invalid
  rawDate: string;
  error: string | null;
};

/** Split one CSV line into trimmed cells, honoring simple double-quote wrapping (used for amounts like "1,300"). */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parsePaymentCsv(text: string): ParsedCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const startIdx = /student_code/i.test(lines[0]) ? 1 : 0;
  const rows: ParsedCsvRow[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const studentCode = cells[0] ?? "";
    const studentName = cells[1] ?? "";
    const amountRaw = (cells[2] ?? "").replace(/,/g, "");
    const rawDate = cells[3] ?? "";
    const amount = Number(amountRaw);
    const paidDateIso = parseBuddhistDate(rawDate);

    let error: string | null = null;
    if (!studentCode) error = "ไม่มีรหัสนักเรียน";
    else if (!Number.isFinite(amount) || amount <= 0) error = "ยอดเงินไม่ถูกต้อง";
    else if (!paidDateIso) error = "วันที่ไม่ถูกต้อง";

    rows.push({
      lineNumber: i + 1,
      studentCode,
      studentName,
      amount: Number.isFinite(amount) ? amount : 0,
      paidDateIso: paidDateIso ?? "",
      rawDate,
      error,
    });
  }

  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- csv-import`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/csv-import.ts src/lib/finance/csv-import.test.ts
git commit -m "feat: add CSV row parser for payment import"
```

---

## Task 3: Row assessment (validation status)

**Files:**
- Modify: `src/lib/finance/csv-import.ts`
- Test: `src/lib/finance/csv-import.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/finance/csv-import.test.ts
import { assessImportRow } from "./csv-import";

describe("assessImportRow", () => {
  const base = {
    parseError: null,
    matchedStudentId: "s1",
    systemName: "อลิสา มูลทา",
    csvName: "อลิสา มูลทา",
    amount: 2000,
    outstanding: 2000,
  };

  it("marks a full payment", () => {
    expect(assessImportRow(base)).toEqual({
      status: "full",
      nameMismatch: false,
      willImport: true,
    });
  });

  it("marks a partial payment", () => {
    expect(assessImportRow({ ...base, amount: 1500 })).toMatchObject({
      status: "partial",
      willImport: true,
    });
  });

  it("blocks overpayment", () => {
    expect(assessImportRow({ ...base, amount: 2500 })).toMatchObject({
      status: "over",
      willImport: false,
    });
  });

  it("blocks zero outstanding", () => {
    expect(assessImportRow({ ...base, outstanding: 0 })).toMatchObject({
      status: "no_outstanding",
      willImport: false,
    });
  });

  it("blocks unmatched student", () => {
    expect(
      assessImportRow({ ...base, matchedStudentId: null, outstanding: null }),
    ).toMatchObject({ status: "not_found", willImport: false });
  });

  it("blocks parse errors", () => {
    expect(assessImportRow({ ...base, parseError: "วันที่ไม่ถูกต้อง" })).toMatchObject({
      status: "format_error",
      willImport: false,
    });
  });

  it("warns on name mismatch but still imports", () => {
    const r = assessImportRow({ ...base, csvName: "อลิสา มูลทาa" });
    expect(r.nameMismatch).toBe(true);
    expect(r.willImport).toBe(true);
  });

  it("treats whitespace-only name differences as matching", () => {
    const r = assessImportRow({ ...base, csvName: "อลิสา  มูลทา" });
    expect(r.nameMismatch).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- csv-import`
Expected: FAIL — `assessImportRow` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/lib/finance/csv-import.ts

export type ImportRowStatus =
  | "full"
  | "partial"
  | "format_error"
  | "not_found"
  | "over"
  | "no_outstanding";

export type ImportRowAssessment = {
  status: ImportRowStatus;
  nameMismatch: boolean;
  willImport: boolean;
};

function normalizeName(s: string): string {
  return s.replace(/\s+/g, "");
}

const EPSILON = 0.005;

export function assessImportRow(args: {
  parseError: string | null;
  matchedStudentId: string | null;
  systemName: string | null;
  csvName: string;
  amount: number;
  outstanding: number | null;
}): ImportRowAssessment {
  if (args.parseError) {
    return { status: "format_error", nameMismatch: false, willImport: false };
  }
  if (!args.matchedStudentId || args.outstanding === null) {
    return { status: "not_found", nameMismatch: false, willImport: false };
  }

  const nameMismatch =
    normalizeName(args.systemName ?? "") !== normalizeName(args.csvName);

  if (args.outstanding <= 0) {
    return { status: "no_outstanding", nameMismatch, willImport: false };
  }
  if (args.amount > args.outstanding + EPSILON) {
    return { status: "over", nameMismatch, willImport: false };
  }

  const status: ImportRowStatus =
    Math.abs(args.amount - args.outstanding) < EPSILON ? "full" : "partial";
  return { status, nameMismatch, willImport: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- csv-import`
Expected: PASS (all csv-import tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/csv-import.ts src/lib/finance/csv-import.test.ts
git commit -m "feat: add import row assessment logic"
```

---

## Task 4: Preview server action

**Files:**
- Modify: `src/lib/actions/payments.ts`

- [ ] **Step 1: Add the preview action**

Add near the other exported actions in `src/lib/actions/payments.ts` (after `getStudentOutstandingAction`):

```ts
export type ImportPreviewStudent = {
  studentCode: string;
  studentId: string;
  name: string;
  outstanding: number;
};

export async function getImportPreviewDataAction(
  studentCodes: string[],
  semesterId: string,
) {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const codes = [...new Set(studentCodes.map((c) => c.trim()).filter(Boolean))];
  if (codes.length === 0) {
    return { ok: true as const, students: [] as ImportPreviewStudent[] };
  }

  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .in("student_code", codes);

  const studentRows = students ?? [];
  const studentIds = studentRows.map((s) => s.id);

  const outstandingByStudent = new Map<string, number>();
  if (studentIds.length > 0) {
    const { data: invoices } = await supabase
      .from("student_invoices")
      .select("student_id, total_amount, paid_amount")
      .in("student_id", studentIds)
      .eq("semester_id", semesterId)
      .in("status", ["unpaid", "partial"]);

    for (const inv of invoices ?? []) {
      const due = Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount));
      outstandingByStudent.set(
        inv.student_id,
        round2((outstandingByStudent.get(inv.student_id) ?? 0) + due),
      );
    }
  }

  const result: ImportPreviewStudent[] = studentRows.map((s) => ({
    studentCode: s.student_code,
    studentId: s.id,
    name: formatStudentName(s.first_name, s.last_name),
    outstanding: outstandingByStudent.get(s.id) ?? 0,
  }));

  return { ok: true as const, students: result };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`round2`, `formatStudentName`, `requireFinanceAction`, `createClient` are already imported in this file.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat: add CSV import preview data action"
```

---

## Task 5: Commit server action

**Files:**
- Modify: `src/lib/actions/payments.ts`

- [ ] **Step 1: Add the import action**

Add to `src/lib/actions/payments.ts` (after the preview action). Reuses the existing imports `allocatePaymentFifo`, `deriveInvoiceStatus`, `parseMaxSequence`, `formatReceiptNumber`, `getStudentOutstandingInvoices`, `getDefaultReceiptTypeId`, `getStudentGradeMap`, `formatStudentName`.

```ts
export type ImportRowInput = {
  lineNumber: number;
  studentCode: string;
  csvName: string;
  amount: number;
  paidDateIso: string; // "YYYY-MM-DD"
};

export type ImportBackfillResult = {
  ok: true;
  imported: number;
  failed: { lineNumber: number; studentCode: string; reason: string }[];
};

export async function importPaymentsBackfill(input: {
  rows: ImportRowInput[];
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
}): Promise<ImportBackfillResult | { ok: false; error: string }> {
  const auth = await requireFinanceAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  // Process oldest payment first so receipt numbers run in date order.
  const rows = [...input.rows].sort((a, b) =>
    a.paidDateIso.localeCompare(b.paidDateIso),
  );

  const [{ data: existingReceipts }, receiptTypeId, gradeByStudent] = await Promise.all([
    supabase.from("payments").select("receipt_number").eq("academic_year_id", input.academicYearId),
    getDefaultReceiptTypeId(),
    getStudentGradeMap(input.semesterId),
  ]);

  if (!receiptTypeId) return { ok: false, error: "ไม่พบประเภทใบเสร็จเริ่มต้น" };

  let nextSeq =
    parseMaxSequence(
      (existingReceipts ?? []).map((r) => r.receipt_number),
      input.academicYearName,
    ) + 1;

  // Resolve all student codes up front.
  const codes = [...new Set(rows.map((r) => r.studentCode))];
  const { data: students } = await supabase
    .from("students")
    .select("id, student_code, first_name, last_name")
    .in("student_code", codes);
  const studentByCode = new Map(
    (students ?? []).map((s) => [s.student_code, s]),
  );

  const failed: ImportBackfillResult["failed"] = [];
  let imported = 0;

  for (const row of rows) {
    const student = studentByCode.get(row.studentCode);
    if (!student) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ไม่พบรหัสนักเรียน" });
      continue;
    }

    const outstanding = await getStudentOutstandingInvoices(student.id, input.semesterId);
    const totalDue = outstanding.reduce((sum, inv) => sum + inv.outstanding, 0);

    if (row.amount <= 0) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ยอดเงินไม่ถูกต้อง" });
      continue;
    }
    if (totalDue <= 0) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ไม่มียอดค้างชำระ" });
      continue;
    }
    if (row.amount > round2(totalDue) + 0.005) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ยอดเกินยอดค้าง" });
      continue;
    }

    const allocations = allocatePaymentFifo(
      row.amount,
      outstanding.map((inv) => ({ id: inv.id, createdAt: inv.createdAt, outstanding: inv.outstanding })),
    );
    if (allocations.length === 0) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "จัดสรรเงินไม่ได้" });
      continue;
    }

    const receiptNumber = formatReceiptNumber(input.academicYearName, nextSeq);
    const paidTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
    const paidAt = `${row.paidDateIso}T12:00:00+07:00`;
    const gradeClassroom = gradeByStudent.get(student.id) ?? "—";

    const snapshot: Record<string, unknown> = {
      receiptNumber,
      paidAt,
      studentCode: student.student_code,
      studentName: formatStudentName(student.first_name, student.last_name),
      gradeClassroom,
      paymentMethod: "cash",
      transferReference: null,
      amount: paidTotal,
      allocations: allocations.map((a) => {
        const inv = outstanding.find((i) => i.id === a.invoiceId)!;
        return { invoiceId: a.invoiceId, invoiceName: inv.invoiceName, amount: a.amount };
      }),
      recordedBy: auth.profile.display_name ?? "เจ้าหน้าที่",
    };

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        receipt_number: receiptNumber,
        student_id: student.id,
        academic_year_id: input.academicYearId,
        amount: paidTotal,
        payment_method: "cash",
        transfer_reference: null,
        paid_at: paidAt,
        recorded_by: auth.profile.id,
        note: "นำเข้าย้อนหลัง",
        status: "active",
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "บันทึกการชำระไม่ได้" });
      continue;
    }

    const { error: allocError } = await supabase.from("payment_allocations").insert(
      allocations.map((a) => ({ payment_id: payment.id, invoice_id: a.invoiceId, amount: a.amount })),
    );
    if (allocError) {
      await supabase.from("payments").delete().eq("id", payment.id);
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "จัดสรรเข้าใบแจ้งไม่ได้" });
      continue;
    }

    const { error: receiptError } = await supabase.from("receipts").insert({
      payment_id: payment.id,
      receipt_number: receiptNumber,
      receipt_type_id: receiptTypeId,
      snapshot_data: snapshot,
    });
    if (receiptError) {
      await supabase.from("payment_allocations").delete().eq("payment_id", payment.id);
      await supabase.from("payments").delete().eq("id", payment.id);
      failed.push({ lineNumber: row.lineNumber, studentCode: row.studentCode, reason: "ออกใบเสร็จไม่ได้" });
      continue;
    }

    for (const alloc of allocations) {
      const inv = outstanding.find((i) => i.id === alloc.invoiceId)!;
      const newPaid = round2(inv.paidAmount + alloc.amount);
      await supabase
        .from("student_invoices")
        .update({ paid_amount: newPaid, status: deriveInvoiceStatus(newPaid, inv.totalAmount) })
        .eq("id", alloc.invoiceId);
    }

    nextSeq += 1;
    imported += 1;
  }

  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath("/reports/outstanding");
  revalidatePath("/reports/collections");
  revalidatePath("/");

  return { ok: true, imported, failed };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat: add payment backfill import action"
```

---

## Task 6: Import dialog component

**Files:**
- Create: `src/components/finance/payment-import-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
import { assessImportRow, parsePaymentCsv, type ImportRowStatus } from "@/lib/finance/csv-import";
import {
  getImportPreviewDataAction,
  importPaymentsBackfill,
  type ImportRowInput,
} from "@/lib/actions/payments";
import { cn } from "@/lib/utils";

type PreviewRow = {
  lineNumber: number;
  studentCode: string;
  csvName: string;
  systemName: string | null;
  amount: number;
  outstanding: number | null;
  paidDateIso: string;
  status: ImportRowStatus;
  nameMismatch: boolean;
  willImport: boolean;
};

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  full: "ชำระเต็ม",
  partial: "ชำระบางส่วน",
  format_error: "รูปแบบผิด",
  not_found: "ไม่พบรหัส",
  over: "ยอดเกินค้าง",
  no_outstanding: "ไม่มียอดค้าง",
};

const STATUS_CLASS: Record<ImportRowStatus, string> = {
  full: "text-emerald-700",
  partial: "text-sky-700",
  format_error: "text-destructive",
  not_found: "text-destructive",
  over: "text-destructive",
  no_outstanding: "text-destructive",
};

const TEMPLATE_CSV =
  "student_code,student_name,amount,paid_date\n14333,นาลันทา ศรีวัฒนพงศ์,3600,06/05/2569\n";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  onImported: () => void;
};

export function PaymentImportDialog({
  open,
  onOpenChange,
  academicYearId,
  academicYearName,
  semesterId,
  onImported,
}: Props) {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setRows([]);
    setParsing(false);
    setSubmitting(false);
  }

  function downloadTemplate() {
    const blob = new Blob(["﻿" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payment-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);

    const text = await file.text();
    const parsed = parsePaymentCsv(text);

    const codes = parsed.map((r) => r.studentCode).filter(Boolean);
    const preview = await getImportPreviewDataAction(codes, semesterId);
    if (!preview.ok) {
      toast.error(preview.error);
      setParsing(false);
      return;
    }
    const byCode = new Map(preview.students.map((s) => [s.studentCode, s]));

    const assessed: PreviewRow[] = parsed.map((r) => {
      const match = byCode.get(r.studentCode) ?? null;
      const a = assessImportRow({
        parseError: r.error,
        matchedStudentId: match?.studentId ?? null,
        systemName: match?.name ?? null,
        csvName: r.studentName,
        amount: r.amount,
        outstanding: match?.outstanding ?? null,
      });
      return {
        lineNumber: r.lineNumber,
        studentCode: r.studentCode,
        csvName: r.studentName,
        systemName: match?.name ?? null,
        amount: r.amount,
        outstanding: match?.outstanding ?? null,
        paidDateIso: r.paidDateIso,
        status: a.status,
        nameMismatch: a.nameMismatch,
        willImport: a.willImport,
      };
    });

    setRows(assessed);
    setParsing(false);
    e.target.value = "";
  }

  async function handleConfirm() {
    const importable: ImportRowInput[] = rows
      .filter((r) => r.willImport)
      .map((r) => ({
        lineNumber: r.lineNumber,
        studentCode: r.studentCode,
        csvName: r.csvName,
        amount: r.amount,
        paidDateIso: r.paidDateIso,
      }));

    if (importable.length === 0) {
      toast.error("ไม่มีรายการที่นำเข้าได้");
      return;
    }

    setSubmitting(true);
    const result = await importPaymentsBackfill({
      rows: importable,
      academicYearId,
      academicYearName,
      semesterId,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`นำเข้าสำเร็จ ${result.imported} รายการ${result.failed.length ? ` · ล้มเหลว ${result.failed.length}` : ""}`);
    reset();
    onOpenChange(false);
    onImported();
  }

  const willImportCount = rows.filter((r) => r.willImport).length;
  const skipCount = rows.length - willImportCount;
  const totalAmount = rows.filter((r) => r.willImport).reduce((sum, r) => sum + r.amount, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>นำเข้าการชำระเงินจาก CSV</DialogTitle>
          <DialogDescription>
            ไฟล์ต้องมีคอลัมน์: รหัส, ชื่อ, ยอดชำระ, วันที่ (พ.ศ. วว/ดด/ปปปป)
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={parsing || submitting} />
          <button type="button" className="text-sm text-primary hover:underline" onClick={downloadTemplate}>
            ดาวน์โหลดเทมเพลต
          </button>
        </div>

        {rows.length > 0 ? (
          <>
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อใน CSV</TableHead>
                    <TableHead>ชื่อในระบบ</TableHead>
                    <TableHead className="text-right">ยอดชำระ</TableHead>
                    <TableHead className="text-right">ยอดค้าง</TableHead>
                    <TableHead>วันที่</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.lineNumber}>
                      <TableCell className="tabular-nums">{r.studentCode}</TableCell>
                      <TableCell>{r.csvName}</TableCell>
                      <TableCell className={cn(r.nameMismatch && "text-amber-600")}>
                        {r.systemName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(r.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.outstanding === null ? "—" : formatBaht(r.outstanding)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.paidDateIso ? formatThaiDate(`${r.paidDateIso}T12:00:00+07:00`) : "—"}
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap", STATUS_CLASS[r.status])}>
                        {STATUS_LABEL[r.status]}
                        {r.nameMismatch && r.willImport ? " ⚠" : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-sm text-muted-foreground">
              พร้อมนำเข้า {willImportCount} รายการ · ข้าม {skipCount} รายการ · ยอดรวม {formatBaht(totalAmount)}
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/payment-import-dialog.tsx
git commit -m "feat: add payment CSV import dialog with preview"
```

---

## Task 7: Wire the button into the payments panel

**Files:**
- Modify: `src/components/finance/payments-panel.tsx`

- [ ] **Step 1: Import the dialog and add state**

At the top of `src/components/finance/payments-panel.tsx`, add to the imports:

```tsx
import { PaymentImportDialog } from "@/components/finance/payment-import-dialog";
```

Inside `PaymentsPanel`, next to the other `useState` hooks (near `const [confirmOpen, setConfirmOpen] = useState(false);`), add:

```tsx
const [importOpen, setImportOpen] = useState(false);
```

- [ ] **Step 2: Add the button to the "รับชำระเงิน" card header**

Find the card header (`<CardTitle className="text-base">รับชำระเงิน</CardTitle>` inside its `<CardHeader>`). Replace that `CardHeader` block:

```tsx
              <CardHeader>
                <CardTitle className="text-base">รับชำระเงิน</CardTitle>
              </CardHeader>
```

with:

```tsx
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">รับชำระเงิน</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  นำเข้า CSV
                </Button>
              </CardHeader>
```

- [ ] **Step 3: Render the dialog**

Just before the closing `</main>` tag (after the void `AlertDialog` block, before `</div>` that wraps the page content / `</main>`), add:

```tsx
          {ctx ? (
            <PaymentImportDialog
              open={importOpen}
              onOpenChange={setImportOpen}
              academicYearId={ctx.academicYearId}
              academicYearName={ctx.academicYearName}
              semesterId={ctx.semesterId}
              onImported={() => {
                void queryClient.invalidateQueries({ queryKey: ["payments"] });
                void queryClient.invalidateQueries({ queryKey: ["invoices"] });
                void queryClient.invalidateQueries({ queryKey: ["invoice-candidates"] });
                router.refresh();
              }}
            />
          ) : null}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/payments-panel.tsx
git commit -m "feat: add CSV import button to payments panel"
```

---

## Task 8: Manual verification

- [ ] **Step 1: Run the test suite**

Run: `npm test`
Expected: all tests pass, including the csv-import suite.

- [ ] **Step 2: Run the app and exercise the flow**

Run the dev server (`npm run dev`), log in, open **การชำระเงิน**, click **นำเข้า CSV**:
- Download the template, confirm it opens with the expected header and a sample row.
- Upload a small CSV with: one full-payment row, one partial-payment row, one bad code, one name-mismatch row.
- Confirm the preview shows the right status per row (เขียว/ฟ้า/แดง/เหลือง ⚠) and the summary counts.
- Click **ยืนยันนำเข้า**; confirm the toast reports the imported count.
- Verify in the payments table that receipts appear with the historical dates, numbered in date order, and that the partial-payment invoice shows "ชำระบางส่วน" with the correct remaining balance.

- [ ] **Step 3: One-time test-data clearing (only when the user is ready to import for real)**

This is a destructive, one-off step — run it only when the user confirms. With the 5 test receipts present, clearing means: delete `receipts`, then `payment_allocations`, then `payments` for the academic year, and reset `paid_amount = 0`, `status = 'unpaid'` on the affected `student_invoices`. Do this via a deliberate, reviewed SQL/script step (not part of the import button), then re-run the import so receipts start at `<year>/00001`.

---

## Notes

- The import action sets `paid_at` to noon Bangkok (`T12:00:00+07:00`) so the displayed Thai date matches the CSV date regardless of the viewer's timezone.
- Re-importing the same file is self-protecting: once outstanding is 0, those rows fall under "ไม่มียอดค้าง"/"ยอดเกินค้าง" and are skipped.
- `payment_method` is always `cash`; `transfer_reference` is null; `note` is "นำเข้าย้อนหลัง".
