# Payment Import Dialog UI Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the payments page's CSV and XLSX import dialogs match the visual/interaction pattern of `student-import-dialog.tsx` (wide dialog, format table, styled sample-download + file-select buttons), and add a sample XLSX download that doesn't currently exist.

**Architecture:** Two new pure-data lib files (`src/lib/finance/csv-format.ts`, `src/lib/finance/xlsx-format.ts`) hold format-table constants and sample-file builders, following the existing `src/lib/students/csv-format.ts` pattern. The two dialog components are restyled to consume them — no changes to parsing/preview/import logic.

**Tech Stack:** Next.js, React, TypeScript, `xlsx` (SheetJS) package (already a dependency), Vitest for tests, shadcn/ui `Button`/`Dialog`/`Table` components.

---

### Task 1: `src/lib/finance/csv-format.ts` — CSV format table + sample content

**Files:**
- Create: `src/lib/finance/csv-format.ts`
- Test: `src/lib/finance/csv-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finance/csv-format.test.ts
import { describe, expect, it } from "vitest";
import { parsePaymentCsv } from "./csv-import";
import { CSV_FORMAT_TABLE, SAMPLE_CSV_CONTENT, SAMPLE_CSV_FILENAME } from "./csv-format";

describe("CSV_FORMAT_TABLE", () => {
  it("documents exactly the 5 columns parsePaymentCsv reads", () => {
    expect(CSV_FORMAT_TABLE.map((r) => r.key)).toEqual([
      "student_code",
      "first_name",
      "last_name",
      "amount",
      "paid_date",
    ]);
  });
});

describe("SAMPLE_CSV_CONTENT", () => {
  it("parses cleanly with no row errors", () => {
    const rows = parsePaymentCsv(SAMPLE_CSV_CONTENT);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.error).toBeNull();
    }
  });
});

describe("SAMPLE_CSV_FILENAME", () => {
  it("ends with .csv", () => {
    expect(SAMPLE_CSV_FILENAME.endsWith(".csv")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/lib/finance/csv-format.test.ts`
Expected: FAIL with "Cannot find module './csv-format'" (or similar — the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/finance/csv-format.ts
export const CSV_FORMAT_TABLE = [
  {
    key: "student_code",
    description: "รหัสนักเรียน",
    example: "14333",
  },
  {
    key: "first_name",
    description: "ชื่อ",
    example: "นาลันทา",
  },
  {
    key: "last_name",
    description: "นามสกุล",
    example: "ศรีวัฒนพงศ์",
  },
  {
    key: "amount",
    description: "ยอดชำระ (บาท)",
    example: "3600",
  },
  {
    key: "paid_date",
    description: "วันที่ชำระ — พ.ศ. วว/ดด/ปปปป",
    example: "06/05/2569",
  },
] as const;

export const SAMPLE_CSV_CONTENT = [
  "student_code,first_name,last_name,amount,paid_date",
  "14333,นาลันทา,ศรีวัฒนพงศ์,3600,06/05/2569",
  "14399,อลิสา,มูลทา,2000,12/05/2569",
].join("\n");

export const SAMPLE_CSV_FILENAME = "payment-import-sample.csv";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run src/lib/finance/csv-format.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/csv-format.ts src/lib/finance/csv-format.test.ts
git commit -m "feat(finance): add CSV format table + sample content for payment import"
```

---

### Task 2: Restyle `payment-import-dialog.tsx` to match student import

**Files:**
- Modify: `src/components/finance/payment-import-dialog.tsx`

- [ ] **Step 1: Add imports and a `fileInputRef`, remove the old inline template**

Replace the top of the file (imports block and the `TEMPLATE_CSV` constant / `downloadTemplate` function) with:

```tsx
"use client";

import { useRef, useState } from "react";
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
import { CSV_FORMAT_TABLE, SAMPLE_CSV_CONTENT, SAMPLE_CSV_FILENAME } from "@/lib/finance/csv-format";
import {
  getImportPreviewDataAction,
  importPaymentsBackfill,
  type ImportRowInput,
} from "@/lib/actions/payments";
import { cn } from "@/lib/utils";
```

(This drops the `TEMPLATE_CSV` constant entirely — it's now `SAMPLE_CSV_CONTENT` in `csv-format.ts`.)

- [ ] **Step 2: Replace `downloadTemplate` with `downloadSampleCsv`**

Find:
```tsx
  function downloadTemplate() {
    const blob = new Blob(["﻿" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payment-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
```

Replace with:
```tsx
  function downloadSampleCsv() {
    const blob = new Blob(["﻿" + SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = SAMPLE_CSV_FILENAME;
    a.click();
    URL.revokeObjectURL(url);
  }
```

- [ ] **Step 3: Add the `fileInputRef` inside the component**

Find:
```tsx
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
```

Replace with:
```tsx
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
```

- [ ] **Step 4: Widen the dialog and restructure the body**

Find:
```tsx
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>นำเข้าการชำระเงินจาก CSV</DialogTitle>
          <DialogDescription>
            ไฟล์ต้องมีคอลัมน์: รหัส, ชื่อ, สกุล, ยอดชำระ, วันที่ (พ.ศ. วว/ดด/ปปปป)
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
```

Replace with:
```tsx
      <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>นำเข้าการชำระเงินจาก CSV</DialogTitle>
          <DialogDescription>อัปโหลดไฟล์ตามรูปแบบด้านล่าง ระบบจะตรวจสอบก่อนนำเข้า</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="overflow-x-auto rounded-md border">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>คอลัมน์</TableHead>
                  <TableHead>คำอธิบาย</TableHead>
                  <TableHead>ตัวอย่าง</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CSV_FORMAT_TABLE.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-mono text-xs">{row.key}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="text-muted-foreground">{row.example}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={downloadSampleCsv}>
              ดาวน์โหลดไฟล์ตัวอย่าง
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={parsing || submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              เลือกไฟล์ CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {rows.length > 0 ? (
            <>
              <div className="max-h-[50vh] overflow-auto rounded-md border">
```

- [ ] **Step 5: Close the new wrapper `div` before `DialogFooter`**

Find:
```tsx
            <p className="text-sm text-muted-foreground">
              พร้อมนำเข้า {willImportCount} รายการ · ข้าม {skipCount} รายการ · ยอดรวม {formatBaht(totalAmount)}
            </p>
          </>
        ) : null}

        <DialogFooter>
```

Replace with:
```tsx
              <p className="text-sm text-muted-foreground">
                พร้อมนำเข้า {willImportCount} รายการ · ข้าม {skipCount} รายการ · ยอดรวม {formatBaht(totalAmount)}
              </p>
            </>
          ) : null}
        </div>

        <DialogFooter>
```

(Note the re-indentation of the `rows.length > 0` block's contents by two spaces, and the closing `</div>` for the `min-h-0 flex-1` wrapper opened in Step 4.)

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

Run: `yarn vitest run`
Expected: PASS (this file has no dedicated test, but `csv-import.test.ts` and other suites must still pass since `csv-import.ts` itself is untouched)

- [ ] **Step 7: Typecheck**

Run: `yarn tsc --noEmit`
Expected: no errors in `payment-import-dialog.tsx`

- [ ] **Step 8: Commit**

```bash
git add src/components/finance/payment-import-dialog.tsx
git commit -m "feat(finance): restyle CSV payment import dialog to match student import UI"
```

---

### Task 3: `src/lib/finance/xlsx-format.ts` — XLSX format table + sample workbook builder

**Files:**
- Create: `src/lib/finance/xlsx-format.ts`
- Test: `src/lib/finance/xlsx-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finance/xlsx-format.test.ts
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildImportGroups, parseXlsxWorkbook } from "@/lib/finance/xlsx-import";
import { SAMPLE_XLSX_FILENAME, XLSX_FORMAT_TABLE, buildSampleXlsxWorkbook } from "./xlsx-format";

describe("XLSX_FORMAT_TABLE", () => {
  it("documents all 10 data columns parseXlsxWorkbook reads, in sheet order", () => {
    expect(XLSX_FORMAT_TABLE.map((r) => r.key)).toEqual([
      "รหัสนักเรียน",
      "ชื่อ",
      "นามสกุล",
      "เบิกได้",
      "ใบสำคัญ (ค่าเล่าเรียน)",
      "เบิกไม่ได้",
      "ค่าอาหารกลางวัน",
      "ค่าเอกสาร",
      "ค่าประกัน",
      "ค่าครูต่างชาติ",
      "ใบสำคัญ (ประกัน)",
      "วันที่ชำระ",
    ]);
  });
});

describe("SAMPLE_XLSX_FILENAME", () => {
  it("ends with .xlsx", () => {
    expect(SAMPLE_XLSX_FILENAME.endsWith(".xlsx")).toBe(true);
  });
});

describe("buildSampleXlsxWorkbook", () => {
  it("produces a workbook parseXlsxWorkbook can read back into 2 valid rows", () => {
    const workbook = buildSampleXlsxWorkbook();
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const rows = parseXlsxWorkbook(buffer);
    expect(rows).toHaveLength(2);

    const [first, second] = rows;
    expect(first.studentCode).toBe("14333");
    expect(first.paidDateIso).toBe("2026-05-05");
    expect(second.studentCode).toBe("14399");
    expect(second.paidDateIso).toBe("2026-05-12");
  });

  it("produces groups that would import cleanly (one เบิกได้ row, one เบิกไม่ได้ row)", () => {
    const workbook = buildSampleXlsxWorkbook();
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = parseXlsxWorkbook(buffer);
    const groups = rows.flatMap(buildImportGroups);

    const tuitionGroups = groups.filter((g) => g.kind === "tuition");
    expect(tuitionGroups).toHaveLength(2);
    expect(tuitionGroups[0].expectedIsReimbursable).toBe(true);
    expect(tuitionGroups[1].expectedIsReimbursable).toBe(false);

    const insuranceGroups = groups.filter((g) => g.kind === "insurance");
    expect(insuranceGroups).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/lib/finance/xlsx-format.test.ts`
Expected: FAIL with "Cannot find module './xlsx-format'"

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/finance/xlsx-format.ts
import * as XLSX from "xlsx";

export const XLSX_FORMAT_TABLE = [
  { key: "รหัสนักเรียน", description: "รหัสนักเรียน", example: "14333" },
  { key: "ชื่อ", description: "ชื่อ", example: "นาลันทา" },
  { key: "นามสกุล", description: "นามสกุล", example: "ศรีวัฒนพงศ์" },
  { key: "เบิกได้", description: "ยอดค่าเล่าเรียนที่เบิกได้ (บาท)", example: "3600" },
  { key: "ใบสำคัญ (ค่าเล่าเรียน)", description: "เลขที่ใบสำคัญรับเงินฝั่งค่าเล่าเรียน", example: "53-2606" },
  { key: "เบิกไม่ได้", description: "ยอดค่าเล่าเรียนที่เบิกไม่ได้ (บาท)", example: "2900" },
  { key: "ค่าอาหารกลางวัน", description: "ค่าอาหารกลางวัน (บาท)", example: "500" },
  { key: "ค่าเอกสาร", description: "ค่าเอกสารประกอบการเรียนและวัดผล (บาท)", example: "400" },
  { key: "ค่าประกัน", description: "ค่าประกันอุบัติเหตุ (บาท) — ใส่ค่าลบสำหรับส่วนลด", example: "300" },
  { key: "ค่าครูต่างชาติ", description: "ค่าครูสอนภาษาต่างประเทศ (บาท)", example: "—" },
  { key: "ใบสำคัญ (ประกัน)", description: "เลขที่ใบสำคัญรับเงินฝั่งค่าประกัน", example: "—" },
  { key: "วันที่ชำระ", description: "วันที่ชำระ — เซลล์ชนิดวันที่ (Date) ของ Excel", example: "5/5/69" },
] as const;

export const SAMPLE_XLSX_FILENAME = "payment-import-sample.xlsx";

/**
 * Excel stores a staff-typed 2-digit Buddhist year (e.g. "5/5/69") as 1969 per
 * its own short-year rule; parseXlsxWorkbook corrects it back to 2569 BE /
 * 2026 CE. This sample encodes that same quirk so it matches real files.
 */
function buddhistShortYearCell(day: number, month: number, buddhistYear2Digit: number): Date {
  return new Date(1900 + buddhistYear2Digit, month - 1, day);
}

export function buildSampleXlsxWorkbook(): XLSX.WorkBook {
  const aoa = [
    ["ม.2/1"], // row 1: classroom label
    [], // row 2: blank
    [
      "ลำดับ",
      "รหัสนักเรียน",
      "ชื่อ",
      "นามสกุล",
      "เบิกได้",
      "ใบสำคัญ",
      "เบิกไม่ได้",
      "ค่าอาหารกลางวัน",
      "ค่าเอกสาร",
      "ค่าประกัน",
      "ค่าครูต่างชาติ",
      "ใบสำคัญ",
      "วันที่ชำระ",
    ], // row 3: headers
    [
      1,
      "14333",
      "นาลันทา",
      "ศรีวัฒนพงศ์",
      3600,
      "53-2606",
      "-",
      500,
      "-",
      300,
      "-",
      "-",
      buddhistShortYearCell(5, 5, 69), // 5/5/69 -> corrected to 2026-05-05
    ],
    [
      2,
      "14399",
      "อลิสา",
      "มูลทา",
      "-",
      "-",
      2900,
      "-",
      400,
      "-",
      "-",
      "-",
      buddhistShortYearCell(12, 5, 69), // 12/5/69 -> corrected to 2026-05-12
    ],
  ];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return workbook;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run src/lib/finance/xlsx-format.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/xlsx-format.ts src/lib/finance/xlsx-format.test.ts
git commit -m "feat(finance): add XLSX format table + sample workbook builder for payment import"
```

---

### Task 4: Restyle `xlsx-payment-import-dialog.tsx` and add sample download

**Files:**
- Modify: `src/components/finance/xlsx-payment-import-dialog.tsx`

- [ ] **Step 1: Add imports and a `fileInputRef`**

Find:
```tsx
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
```

Replace with:
```tsx
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
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
  SAMPLE_XLSX_FILENAME,
  XLSX_FORMAT_TABLE,
  buildSampleXlsxWorkbook,
} from "@/lib/finance/xlsx-format";
```

- [ ] **Step 2: Add `fileInputRef` and `downloadSampleXlsx` inside the component**

Find:
```tsx
  const [groups, setGroups] = useState<PreviewGroup[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setGroups([]);
    setParsing(false);
    setSubmitting(false);
  }
```

Replace with:
```tsx
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [groups, setGroups] = useState<PreviewGroup[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setGroups([]);
    setParsing(false);
    setSubmitting(false);
  }

  function downloadSampleXlsx() {
    const workbook = buildSampleXlsxWorkbook();
    XLSX.writeFile(workbook, SAMPLE_XLSX_FILENAME);
  }
```

- [ ] **Step 3: Widen the dialog and add the format table + button row**

Find:
```tsx
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
```

Replace with:
```tsx
      <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>นำเข้าการชำระเงินจาก XLSX</DialogTitle>
          <DialogDescription>
            ไฟล์รูปแบบใบบันทึกการชำระรายห้อง — แถว 1 คือชื่อห้อง, แถว 3 คือหัวคอลัมน์, แถว 4 เป็นต้นไปคือข้อมูลนักเรียน ใส่ตัวเลขติดลบสำหรับส่วนลด เช่น -200
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="overflow-x-auto rounded-md border">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>คอลัมน์</TableHead>
                  <TableHead>คำอธิบาย</TableHead>
                  <TableHead>ตัวอย่าง</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {XLSX_FORMAT_TABLE.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-mono text-xs">{row.key}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="text-muted-foreground">{row.example}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={downloadSampleXlsx}>
              ดาวน์โหลดไฟล์ตัวอย่าง
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={parsing || submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              เลือกไฟล์ XLSX
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {groups.length > 0 ? (
            <>
              <div className="max-h-[50vh] overflow-auto rounded-md border">
```

- [ ] **Step 4: Close the new wrapper `div` before `DialogFooter`**

Find:
```tsx
            <p className="text-sm text-muted-foreground">
              พร้อมนำเข้า {willImportCount} รายการ · ข้าม {skipCount} รายการ
            </p>
          </>
        ) : null}

        <DialogFooter>
```

Replace with:
```tsx
              <p className="text-sm text-muted-foreground">
                พร้อมนำเข้า {willImportCount} รายการ · ข้าม {skipCount} รายการ
              </p>
            </>
          ) : null}
        </div>

        <DialogFooter>
```

(Same re-indentation note as Task 2 Step 5 — everything inside the old `{groups.length > 0 ? (...)}` block shifts two spaces right, and a closing `</div>` is added for the wrapper opened in Step 3.)

- [ ] **Step 5: Run the full test suite**

Run: `yarn vitest run`
Expected: PASS — all existing suites plus the two new ones from Tasks 1 and 3

- [ ] **Step 6: Typecheck**

Run: `yarn tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/xlsx-payment-import-dialog.tsx
git commit -m "feat(finance): restyle XLSX payment import dialog and add sample download"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server preview** (via the `preview_start` tool, not raw `npm run dev` in a terminal)

- [ ] **Step 2: Navigate to the payments page** (บันทึกการจ่าย) for a semester that has students with unpaid invoices

- [ ] **Step 3: Open "นำเข้า CSV"**
  - Confirm the dialog is now wide (near full viewport width) with a format table listing the 5 CSV columns above the buttons
  - Click "ดาวน์โหลดไฟล์ตัวอย่าง" and confirm a `payment-import-sample.csv` file downloads
  - Click "เลือกไฟล์ CSV", upload the just-downloaded sample, and confirm the preview table renders with 2 rows and no format errors

- [ ] **Step 4: Open "นำเข้า XLSX"**
  - Confirm the dialog is now wide with a format table listing the 12 XLSX columns
  - Click "ดาวน์โหลดไฟล์ตัวอย่าง" and confirm a `payment-import-sample.xlsx` file downloads
  - Click "เลือกไฟล์ XLSX", upload the just-downloaded sample, and confirm the preview table shows groups for both students (skipped as "ไม่พบใบแจ้งหนี้ที่ตรงกัน" is fine since these are placeholder student codes — the point is the file parses without a hard error)

- [ ] **Step 5: Report results to the user** with a screenshot of each dialog in its new layout
