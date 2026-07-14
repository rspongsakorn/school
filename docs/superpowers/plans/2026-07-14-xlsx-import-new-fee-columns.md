# XLSX Import New Fee Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 new fee columns (ค่าเครื่องใช้, ค่าเรียนจินตคณิต, ค่าห้องปรับอากาศ) to the XLSX payment-import parser, at the exact interleaved positions confirmed from a real sample file, feeding them into the existing "tuition" bucket alongside the current 5 tuition-composing columns.

**Architecture:** Pure data-layer change — extend `COL`, `XlsxSheetRow`, `parseXlsxWorkbook`, and `buildImportGroups`'s `tuitionCells` in `src/lib/finance/xlsx-import.ts`, then mirror the new column layout in `src/lib/finance/xlsx-format.ts`'s format table and sample-workbook builder. No UI/dialog changes, no new invoice-matching logic.

**Tech Stack:** TypeScript, `xlsx` (SheetJS), Vitest.

---

### Task 1: Extend `xlsx-import.ts` with the 3 new columns

**Files:**
- Modify: `src/lib/finance/xlsx-import.ts`
- Test: `src/lib/finance/xlsx-import.test.ts`

- [ ] **Step 1: Update the test fixtures to the new 16-column layout**

In `src/lib/finance/xlsx-import.test.ts`, replace `makeRow`'s default fixture (lines 5-21) with:

```ts
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
    equipmentAmount: null,
    foreignTeacherAmount: 500,
    abacusAmount: null,
    airconRoomAmount: null,
    tuitionVoucher: "53-2606",
    insuranceVoucher: null,
    paidDateIso: "2026-05-05",
    ...overrides,
  };
}
```

Replace `buildSheetBuffer` (lines 91-130) with a version that accepts optional overrides for the 3 new columns, defaulting to `"-"` (blank) so every existing call site keeps behaving identically:

```ts
function buildSheetBuffer(
  paidDate: Date,
  opts: { equipment?: number | string; abacus?: number | string; airconRoom?: number | string } = {},
): ArrayBuffer {
  const { equipment = "-", abacus = "-", airconRoom = "-" } = opts;
  const aoa = [
    ["ห้อง ป.1/1"], // row 1: class label
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
      "ค่าเครื่องใช้",
      "ค่าครูต่างชาติ",
      "ค่าเรียนจินตคณิต",
      "ค่าห้องปรับอากาศ",
      "ใบสำคัญ",
      "วันที่ชำระ",
    ], // row 3: headers
    [
      1,
      "13777",
      "ศิริลัดดา",
      "คชรินทร์",
      "-",
      "53-2606",
      2000,
      "-",
      400,
      -200,
      equipment,
      500,
      abacus,
      airconRoom,
      "-",
      paidDate,
    ], // row 4: data
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
```

Update the `"maps columns correctly from a real-shaped sheet"` test's expected object (in the `describe("parseXlsxWorkbook", ...)` block) to include the 3 new fields:

```ts
  it("maps columns correctly from a real-shaped sheet", () => {
    const buffer = buildSheetBuffer(new Date(2026, 4, 5)); // 2026-05-05

    const rows = parseXlsxWorkbook(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      rowNumber: 4,
      studentCode: "13777",
      studentName: "ศิริลัดดา คชรินทร์",
      reimbursableAmount: null,
      nonReimbursableAmount: 2000,
      lunchAmount: null,
      documentAmount: 400,
      insuranceAmount: -200,
      equipmentAmount: null,
      foreignTeacherAmount: 500,
      abacusAmount: null,
      airconRoomAmount: null,
      tuitionVoucher: "53-2606",
      insuranceVoucher: null,
      paidDateIso: "2026-05-05",
    });
  });
```

Add a new test right after it, still inside `describe("parseXlsxWorkbook", ...)`:

```ts
  it("maps the 3 new fee columns (ค่าเครื่องใช้, ค่าเรียนจินตคณิต, ค่าห้องปรับอากาศ) correctly", () => {
    const buffer = buildSheetBuffer(new Date(2026, 4, 5), {
      equipment: 300,
      abacus: 200,
      airconRoom: 150,
    });

    const rows = parseXlsxWorkbook(buffer);
    expect(rows[0].equipmentAmount).toBe(300);
    expect(rows[0].abacusAmount).toBe(200);
    expect(rows[0].airconRoomAmount).toBe(150);
  });
```

Add a new test inside `describe("buildImportGroups", ...)`, after the existing `"sums two simultaneous negative cells into a single discount"` test:

```ts
  it("sums the 3 new fee columns into the tuition group's total", () => {
    const groups = buildImportGroups(
      makeRow({ equipmentAmount: 300, abacusAmount: 500, airconRoomAmount: -100 }),
    );
    const tuition = groups.find((g) => g.kind === "tuition")!;
    // cash: 2000 (nonReimbursable) + 400 (document) + 500 (foreignTeacher) + 300 (equipment) + 500 (abacus) = 3700
    // discount: 100 (airconRoom)
    expect(tuition.netCash).toBe(3700);
    expect(tuition.discount).toBe(100);
    expect(tuition.groupTotal).toBe(3800);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/finance/xlsx-import.test.ts`
Expected: FAIL — type errors on `XlsxSheetRow` (missing `equipmentAmount`/`abacusAmount`/`airconRoomAmount` properties) and/or assertion failures, since `xlsx-import.ts` doesn't have the new fields yet.

- [ ] **Step 3: Update the `COL` map and `XlsxSheetRow` type**

In `src/lib/finance/xlsx-import.ts`, replace the `XlsxSheetRow` type (lines 3-16) with:

```ts
export type XlsxSheetRow = {
  rowNumber: number;
  studentCode: string;
  studentName: string;
  reimbursableAmount: number | null; // เบิกได้
  nonReimbursableAmount: number | null; // เบิกไม่ได้
  lunchAmount: number | null; // ค่าอาหารกลางวัน
  documentAmount: number | null; // ค่าเอกสารประกอบการเรียนและวัดผล
  insuranceAmount: number | null; // ค่าประกัน
  equipmentAmount: number | null; // ค่าเครื่องใช้
  foreignTeacherAmount: number | null; // ค่าครูสอนภาษาต่างประเทศ
  abacusAmount: number | null; // ค่าเรียนจินตคณิต
  airconRoomAmount: number | null; // ค่าห้องปรับอากาศ
  tuitionVoucher: string | null; // first ใบสำคัญ
  insuranceVoucher: string | null; // second ใบสำคัญ
  paidDateIso: string | null; // "YYYY-MM-DD"
};
```

Replace the `COL` map (lines 18-32) with:

```ts
// cells[0] is the row's "ลำดับ" (sequence number) column, intentionally unused.
const COL = {
  STUDENT_CODE: 1,
  FIRST_NAME: 2,
  LAST_NAME: 3,
  REIMBURSABLE: 4,
  TUITION_VOUCHER: 5,
  NON_REIMBURSABLE: 6,
  LUNCH: 7,
  DOCUMENT: 8,
  INSURANCE: 9,
  EQUIPMENT: 10,
  FOREIGN_TEACHER: 11,
  ABACUS: 12,
  AIRCON_ROOM: 13,
  INSURANCE_VOUCHER: 14,
  PAID_DATE: 15,
} as const;
```

- [ ] **Step 4: Read the new cells in `parseXlsxWorkbook`**

Replace the row-building object inside `parseXlsxWorkbook` (lines 55-68) with:

```ts
    rows.push({
      rowNumber: i + 1,
      studentCode,
      studentName: `${firstName} ${lastName}`.trim(),
      reimbursableAmount: parseCellAmount(cells[COL.REIMBURSABLE]),
      nonReimbursableAmount: parseCellAmount(cells[COL.NON_REIMBURSABLE]),
      lunchAmount: parseCellAmount(cells[COL.LUNCH]),
      documentAmount: parseCellAmount(cells[COL.DOCUMENT]),
      insuranceAmount: parseCellAmount(cells[COL.INSURANCE]),
      equipmentAmount: parseCellAmount(cells[COL.EQUIPMENT]),
      foreignTeacherAmount: parseCellAmount(cells[COL.FOREIGN_TEACHER]),
      abacusAmount: parseCellAmount(cells[COL.ABACUS]),
      airconRoomAmount: parseCellAmount(cells[COL.AIRCON_ROOM]),
      tuitionVoucher: parseCellText(cells[COL.TUITION_VOUCHER]),
      insuranceVoucher: parseCellText(cells[COL.INSURANCE_VOUCHER]),
      paidDateIso: parseCellDate(cells[COL.PAID_DATE]),
    });
```

- [ ] **Step 5: Add the new fields to `tuitionCells` in `buildImportGroups`**

Replace the `tuitionCells` array inside `buildImportGroups` (lines 131-137) with:

```ts
  const tuitionCells = [
    row.reimbursableAmount,
    row.nonReimbursableAmount,
    row.lunchAmount,
    row.documentAmount,
    row.foreignTeacherAmount,
    row.equipmentAmount,
    row.abacusAmount,
    row.airconRoomAmount,
  ].filter((v): v is number => v !== null);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/finance/xlsx-import.test.ts`
Expected: PASS (20 tests — 17 existing + 3 new)

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npx vitest run`
Expected: PASS. Note `src/lib/finance/xlsx-format.ts`/`xlsx-format.test.ts` will now FAIL to typecheck/build against the changed `XlsxSheetRow`/`COL` shape — that's expected and fixed in Task 2. If `vitest run` errors out entirely due to this, that's fine; proceed to Task 2 immediately (don't try to make the full suite green before Task 2 is done).

Run: `npx tsc --noEmit`
Expected: errors only in `src/lib/finance/xlsx-format.ts` (still using the old 13-column layout) — confirms Task 1's own files are correct in isolation.

- [ ] **Step 8: Commit**

```bash
git add src/lib/finance/xlsx-import.ts src/lib/finance/xlsx-import.test.ts
git commit -m "feat(finance): add equipment/abacus/aircon-room columns to XLSX payment import"
```

---

### Task 2: Update `xlsx-format.ts` format table and sample workbook

**Files:**
- Modify: `src/lib/finance/xlsx-format.ts`
- Test: `src/lib/finance/xlsx-format.test.ts`

- [ ] **Step 1: Update the format-table test expectation**

In `src/lib/finance/xlsx-format.test.ts`, replace the `XLSX_FORMAT_TABLE` test (lines 6-23) with:

```ts
describe("XLSX_FORMAT_TABLE", () => {
  it("documents all 15 data columns parseXlsxWorkbook reads, in sheet order", () => {
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
      "ค่าเครื่องใช้",
      "ค่าครูต่างชาติ",
      "ค่าเรียนจินตคณิต",
      "ค่าห้องปรับอากาศ",
      "ใบสำคัญ (ประกัน)",
      "วันที่ชำระ",
    ]);
  });
});
```

Replace the `buildSampleXlsxWorkbook` describe block (lines 31-60) with:

```ts
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

  it("exercises the 3 new fee columns across the 2 sample rows", () => {
    const workbook = buildSampleXlsxWorkbook();
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = parseXlsxWorkbook(buffer);

    const [first, second] = rows;
    expect(first.equipmentAmount).toBe(300);
    expect(first.abacusAmount).toBeNull();
    expect(first.airconRoomAmount).toBeNull();

    expect(second.equipmentAmount).toBeNull();
    expect(second.abacusAmount).toBe(200);
    expect(second.airconRoomAmount).toBe(150);
  });

  it("produces groups that would import cleanly (one เบิกได้ row, one เบิกไม่ได้ row)", () => {
    const workbook = buildSampleXlsxWorkbook();
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = parseXlsxWorkbook(buffer);
    const groups = rows.flatMap(buildImportGroups);

    const tuitionGroups = groups.filter((g) => g.kind === "tuition");
    expect(tuitionGroups).toHaveLength(2);
    expect(tuitionGroups[0].expectedIsReimbursable).toBe(true);
    expect(tuitionGroups[0].groupTotal).toBe(4400); // 3600 reimbursable + 500 lunch + 300 equipment
    expect(tuitionGroups[1].expectedIsReimbursable).toBe(false);
    expect(tuitionGroups[1].groupTotal).toBe(3650); // 2900 nonReimbursable + 400 document + 200 abacus + 150 airconRoom

    const insuranceGroups = groups.filter((g) => g.kind === "insurance");
    expect(insuranceGroups).toHaveLength(1);
    expect(insuranceGroups[0].groupTotal).toBe(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/xlsx-format.test.ts`
Expected: FAIL — `XLSX_FORMAT_TABLE` still has the old 12 keys, `buildSampleXlsxWorkbook`'s sheet doesn't have the new columns, so `equipmentAmount`/etc. don't exist on parsed rows and the tuition totals don't match.

- [ ] **Step 3: Update `XLSX_FORMAT_TABLE`**

In `src/lib/finance/xlsx-format.ts`, replace `XLSX_FORMAT_TABLE` (lines 3-16) with:

```ts
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
  { key: "ค่าเครื่องใช้", description: "ค่าเครื่องใช้ (บาท)", example: "300" },
  { key: "ค่าครูต่างชาติ", description: "ค่าครูสอนภาษาต่างประเทศ (บาท)", example: "—" },
  { key: "ค่าเรียนจินตคณิต", description: "ค่าเรียนจินตคณิต (บาท)", example: "200" },
  { key: "ค่าห้องปรับอากาศ", description: "ค่าห้องปรับอากาศ (บาท)", example: "150" },
  { key: "ใบสำคัญ (ประกัน)", description: "เลขที่ใบสำคัญรับเงินฝั่งค่าประกัน", example: "—" },
  { key: "วันที่ชำระ", description: "วันที่ชำระ — เซลล์ชนิดวันที่ (Date) ของ Excel", example: "5/5/69" },
] as const;
```

- [ ] **Step 4: Update `buildSampleXlsxWorkbook`**

Replace the `buildSampleXlsxWorkbook` function (lines 31-86) with:

```ts
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
      "ค่าเครื่องใช้",
      "ค่าครูต่างชาติ",
      "ค่าเรียนจินตคณิต",
      "ค่าห้องปรับอากาศ",
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
      300,
      "-",
      "-",
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
      200,
      150,
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

(The `buddhistShortYearCell` helper above it, and `SAMPLE_XLSX_FILENAME`, are unchanged — leave them as-is.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/xlsx-format.test.ts`
Expected: PASS (5 tests — 1 format-table + 1 filename + 3 workbook tests)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run`
Expected: PASS, all files (this should now be back to fully green — no other files reference the old column layout).

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance/xlsx-format.ts src/lib/finance/xlsx-format.test.ts
git commit -m "feat(finance): add equipment/abacus/aircon-room columns to XLSX format table and sample"
```

---

### Task 3: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server preview** (via the `preview_start` tool with `{name: "dev"}`, or if the launch config launches from the wrong directory in a worktree, start `npx next dev -p <port>` directly in the worktree and open that port in the Browser pane — copy `.env.local` from the main repo into the worktree first if it's missing, since it's gitignored and not copied automatically)

- [ ] **Step 2: Log in and navigate to the payments page** (บันทึกการจ่าย), open "นำเข้า XLSX"

- [ ] **Step 3: Confirm the format table now shows all 15 columns** in the correct order (รหัสนักเรียน ... ค่าประกัน, ค่าเครื่องใช้, ค่าครูต่างชาติ, ค่าเรียนจินตคณิต, ค่าห้องปรับอากาศ, ใบสำคัญ (ประกัน), วันที่ชำระ)

- [ ] **Step 4: Click "ดาวน์โหลดไฟล์ตัวอย่าง", then re-upload the downloaded file** via "เลือกไฟล์ XLSX" (can automate the roundtrip with `javascript_tool`: patch `URL.createObjectURL` to capture the blob, `fetch` it back into a `File`, and dispatch a `change` event on the hidden file input — see the pattern used in the prior restyle work's Task 5 verification)

- [ ] **Step 5: Confirm both sample rows parse with no format errors**, and that any "ข้าม" (skip) status is only due to no matching invoice existing for the placeholder student codes — not a parsing error. If time permits, spot check with the actual user-supplied file (`payment-import-sample (2).xlsx`) that its 4 real students parse and their equipment/abacus/aircon-room amounts show up correctly in the resulting group totals.

- [ ] **Step 6: Report results to the user** with a screenshot of the updated format table and the parsed preview table.
