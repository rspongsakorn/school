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
  { key: "ค่าเครื่องใช้", description: "ค่าเครื่องใช้ (บาท)", example: "300" },
  { key: "ค่าครูต่างชาติ", description: "ค่าครูสอนภาษาต่างประเทศ (บาท)", example: "—" },
  { key: "ค่าเรียนจินตคณิต", description: "ค่าเรียนจินตคณิต (บาท)", example: "200" },
  { key: "ค่าห้องปรับอากาศ", description: "ค่าห้องปรับอากาศ (บาท)", example: "150" },
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
  const fullYear =
    buddhistYear2Digit < 30 ? 2000 + buddhistYear2Digit : 1900 + buddhistYear2Digit;
  return new Date(fullYear, month - 1, day);
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
