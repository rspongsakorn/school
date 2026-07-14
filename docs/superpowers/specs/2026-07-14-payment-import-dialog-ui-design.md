# Payment Import Dialogs — UI Consistency + Sample Downloads

## Problem

`payment-import-dialog.tsx` (CSV) and `xlsx-payment-import-dialog.tsx` (XLSX) on the payments page look and read inconsistently with `student-import-dialog.tsx`, the reference UX everyone agrees is clearer:

- Narrower dialogs (`max-w-3xl` / `max-w-4xl`) instead of the near-full-width layout.
- Format requirements shown as one line of `DialogDescription` prose instead of a scannable table.
- CSV's sample download is a bare text link (`<button className="text-sm text-primary hover:underline">`); XLSX has no sample download at all.
- Raw `<input type="file">` shown directly instead of a styled trigger button.

## Goal

Bring both payment import dialogs in line with `student-import-dialog.tsx`'s layout and interaction pattern, and give XLSX a sample-file download it currently lacks. No changes to parsing, preview, or confirm/import logic in either dialog.

## Design

### Shared layout changes (both dialogs)

- `DialogContent` className changes to match student import:
  `"flex max-h-[90vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[calc(100vw-2rem)]"`
- Body wrapped in `<div className="min-h-0 flex-1 space-y-4 overflow-y-auto">` containing, in order: format table, upload button row, results table/summary (once a file is parsed).
- Upload row becomes:
  ```tsx
  <div className="flex flex-wrap gap-2">
    <Button type="button" variant="outline" onClick={downloadSample}>ดาวน์โหลดไฟล์ตัวอย่าง</Button>
    <Button type="button" variant="outline" disabled={parsing || submitting} onClick={() => fileInputRef.current?.click()}>เลือกไฟล์ CSV|XLSX</Button>
    <input ref={fileInputRef} type="file" accept="..." className="hidden" onChange={handleFile} />
  </div>
  ```
  (adds a `fileInputRef` to each component; existing `handleFile`/`handleFileChange` logic unchanged, just invoked via the hidden input.)

### CSV dialog (`payment-import-dialog.tsx`)

- New file `src/lib/finance/csv-format.ts` (mirrors `src/lib/students/csv-format.ts`):
  - `CSV_FORMAT_TABLE`: rows for `student_code`, `first_name`, `last_name`, `amount`, `paid_date` (description + example each; note paid_date is พ.ศ. วว/ดด/ปปปป).
  - `SAMPLE_CSV_CONTENT`: the existing `TEMPLATE_CSV` content (student 14333 row), moved here.
  - `SAMPLE_CSV_FILENAME = "payment-import-sample.csv"`.
- Dialog renders `CSV_FORMAT_TABLE` as a `Table` above the upload row (same structure as student import's table).
- `downloadTemplate` renamed `downloadSampleCsv`, sourced from the new constants; same Blob/anchor mechanism as today.

### XLSX dialog (`xlsx-payment-import-dialog.tsx`)

- New file `src/lib/finance/xlsx-format.ts`:
  - `XLSX_FORMAT_TABLE`: one row per data column matching `COL` in `src/lib/finance/xlsx-import.ts` — ลำดับ, รหัส, ชื่อ, สกุล, เบิกได้, ใบสำคัญ(ค่าเล่าเรียน), เบิกไม่ได้, ค่าอาหารกลางวัน, ค่าเอกสาร, ค่าประกัน, ค่าครูต่างชาติ, ใบสำคัญ(ประกัน), วันที่ (พ.ศ. 2 หลัก) — plus descriptions/examples. Include a leading note that row 1 = ชื่อห้อง (classroom label) and row 3 = หัวคอลัมน์, data starts row 4.
  - `buildSampleXlsxWorkbook()`: builds a `XLSX.utils.book_new()` workbook using the installed `xlsx` package —
    - Row 1: classroom label, e.g. `["ม.2/1"]`
    - Row 2: blank
    - Row 3: header row matching real files' column order
    - Rows 4-5: two example students exercising the format (one เบิกได้ + ค่าอาหารกลางวัน + ค่าประกัน row, one เบิกไม่ได้ + ค่าเอกสาร row), with a 2-digit-BE-year date string in the date column matching what staff actually type (e.g. `"5/5/69"`) so the sample mirrors real input.
    - `SAMPLE_XLSX_FILENAME = "payment-import-sample.xlsx"`.
- Dialog imports `XLSX_FORMAT_TABLE` for the new table, and a `downloadSampleXlsx()` handler that calls `buildSampleXlsxWorkbook()` then `XLSX.writeFile(workbook, SAMPLE_XLSX_FILENAME)`.

## Non-goals

- No change to how uploaded files are parsed, validated, or imported.
- No two-phase (`setup`/`review`) state machine like student import — both payment dialogs keep their current single-view "upload → inline results table → confirm" flow, just restyled.
- No dedicated "clear/reset" button beyond what already exists via Cancel/close.

## Files touched

- `src/components/finance/payment-import-dialog.tsx`
- `src/components/finance/xlsx-payment-import-dialog.tsx`
- `src/lib/finance/csv-format.ts` (new)
- `src/lib/finance/xlsx-format.ts` (new)
