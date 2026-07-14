# XLSX Payment Import — Add 3 New Fee Columns

## Problem

Schools now bill 3 additional per-classroom fees that the XLSX payment-import sheet doesn't have columns for: ค่าเครื่องใช้ (equipment), ค่าเรียนจินตคณิต (abacus/mental-math class), ค่าห้องปรับอากาศ (air-conditioned room). Staff need these amounts to flow into the same import pipeline as the existing 5 tuition-bucket columns (เบิกได้, เบิกไม่ได้, ค่าอาหารกลางวัน, ค่าเอกสาร, ค่าครูต่างชาติ).

The real-world file layout (confirmed from a user-supplied sample workbook, `payment-import-sample (2).xlsx`) interleaves the new columns rather than appending them at the end:

```
0  ลำดับ (unused)
1  รหัสนักเรียน
2  ชื่อ
3  นามสกุล
4  เบิกได้
5  ใบสำคัญ (ค่าเล่าเรียน)
6  เบิกไม่ได้
7  ค่าอาหารกลางวัน
8  ค่าเอกสาร
9  ค่าประกัน
10 ค่าเครื่องใช้        <- NEW (before ค่าครูต่างชาติ)
11 ค่าครูต่างชาติ
12 ค่าเรียนจินตคณิต     <- NEW
13 ค่าห้องปรับอากาศ     <- NEW
14 ใบสำคัญ (ประกัน)     (was index 11)
15 วันที่ชำระ           (was index 12)
```

Row 1 = classroom label, row 2 = blank, row 3 = header, row 4+ = data — unchanged.

## Goal

Extend the XLSX parser, tuition-group builder, format-table docs, and sample-workbook generator to support the 3 new columns at their correct positions, with each new amount summed into the existing "tuition" bucket (matched against one non-insurance invoice by total, same as today — no new invoice-matching logic). No changes to CSV import, insurance-group logic, or the dialog UI beyond the format table's row list.

## Design

### `src/lib/finance/xlsx-import.ts`

- `COL` map updated to the 16-column layout above: `EQUIPMENT: 10`, `FOREIGN_TEACHER: 11` (was 10), `ABACUS: 12`, `AIRCON_ROOM: 13`, `INSURANCE_VOUCHER: 14` (was 11), `PAID_DATE: 15` (was 12).
- `XlsxSheetRow` gains 3 fields: `equipmentAmount: number | null`, `abacusAmount: number | null`, `airconRoomAmount: number | null` — parsed via the existing `parseCellAmount` helper, same as the other amount columns.
- `parseXlsxWorkbook` reads the 3 new cells at their `COL` indices into the new `XlsxSheetRow` fields.
- `buildImportGroups`'s `tuitionCells` array (currently `[reimbursableAmount, nonReimbursableAmount, lunchAmount, documentAmount, foreignTeacherAmount]`) becomes `[reimbursableAmount, nonReimbursableAmount, lunchAmount, documentAmount, foreignTeacherAmount, equipmentAmount, abacusAmount, airconRoomAmount]`. Sign handling (positive = cash, negative = discount) and `expectedIsReimbursable` derivation are unchanged — the 3 new fields participate identically to the existing tuition-bucket fields.
- `validateGroup`, `InvoiceCandidate`, and the insurance-group branch are untouched.

### `src/lib/finance/xlsx-format.ts`

- `XLSX_FORMAT_TABLE` updated to list all 15 data columns (excludes ลำดับ) in the real sheet order, inserting rows for ค่าเครื่องใช้ (between ค่าประกัน and ค่าครูต่างชาติ), ค่าเรียนจินตคณิต and ค่าห้องปรับอากาศ (between ค่าครูต่างชาติ and ใบสำคัญ(ประกัน)).
- `buildSampleXlsxWorkbook()`'s header row and both example data rows updated to the new 16-column layout, with plausible example values for the 3 new columns (e.g. one row exercises ค่าเครื่องใช้, the other exercises ค่าเรียนจินตคณิต + ค่าห้องปรับอากาศ, so the roundtrip test still covers a variety of populated/blank cells).

### Tests

- `src/lib/finance/xlsx-import.test.ts`: extend `makeRow`'s default fixture with the 3 new fields; add/extend `buildSheetBuffer`'s column array to the 16-column layout; add assertions that `buildImportGroups` correctly sums the new fields into `netCash`/`discount` (e.g. a case with ค่าเครื่องใช้ positive and ค่าห้องปรับอากาศ negative, confirming both feed the same tuition group's total).
- `src/lib/finance/xlsx-format.test.ts`: update the expected `XLSX_FORMAT_TABLE` key list to the new 15-entry order; update the `buildSampleXlsxWorkbook` roundtrip assertions to check the new columns parsed correctly (e.g. assert `equipmentAmount`/`abacusAmount`/`airconRoomAmount` on the parsed rows, and that the resulting tuition group totals reflect them).

## Non-goals

- No new fee-item/invoice-type configuration — `validateGroup` continues to treat "tuition" as one undifferentiated bucket matched by total; no code cares about individual fee names for tuition (only the insurance branch checks for "ประกัน" in the name).
- No changes to the CSV import path, the dialogs' `DialogDescription` text, or the wide-dialog/format-table UI shell established in the prior restyle work — only `XLSX_FORMAT_TABLE`'s row contents change.
- No backward-compatibility shim for old-format files with fewer columns — column positions are fixed by the `COL` map; a file missing the new columns will simply read `null` for those cells (via existing `parseCellAmount` null-handling), which is already how optional columns behave today.

## Files touched

- `src/lib/finance/xlsx-import.ts`
- `src/lib/finance/xlsx-import.test.ts`
- `src/lib/finance/xlsx-format.ts`
- `src/lib/finance/xlsx-format.test.ts`
