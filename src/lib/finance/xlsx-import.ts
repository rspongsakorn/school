import * as XLSX from "xlsx";

export type XlsxSheetRow = {
  rowNumber: number;
  studentCode: string;
  studentName: string;
  reimbursableAmount: number | null; // เบิกได้
  nonReimbursableAmount: number | null; // เบิกไม่ได้
  lunchAmount: number | null; // ค่าอาหารกลางวัน
  documentAmount: number | null; // ค่าเอกสารประกอบการเรียนและวัดผล
  insuranceAmount: number | null; // ค่าประกัน
  foreignTeacherAmount: number | null; // ค่าครูสอนภาษาต่างประเทศ
  tuitionVoucher: string | null; // first ใบสำคัญ
  insuranceVoucher: string | null; // second ใบสำคัญ
  paidDateIso: string | null; // "YYYY-MM-DD"
};

/** Reads the staff's per-classroom sheet: row 1 = class label, row 3 = headers, row 4+ = data. */
export function parseXlsxWorkbook(buffer: ArrayBuffer): XlsxSheetRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const rows: XlsxSheetRow[] = [];
  for (let i = 3; i < raw.length; i++) {
    const cells = raw[i];
    if (!cells || cells.every((c) => c === null || c === "")) continue;

    const studentCode = String(cells[1] ?? "").trim();
    if (!studentCode) continue;

    const firstName = String(cells[2] ?? "").trim();
    const lastName = String(cells[3] ?? "").trim();

    rows.push({
      rowNumber: i + 1,
      studentCode,
      studentName: `${firstName} ${lastName}`.trim(),
      reimbursableAmount: parseCellAmount(cells[4]),
      nonReimbursableAmount: parseCellAmount(cells[6]),
      lunchAmount: parseCellAmount(cells[7]),
      documentAmount: parseCellAmount(cells[8]),
      insuranceAmount: parseCellAmount(cells[9]),
      foreignTeacherAmount: parseCellAmount(cells[10]),
      tuitionVoucher: parseCellText(cells[5]),
      insuranceVoucher: parseCellText(cells[11]),
      paidDateIso: parseCellDate(cells[12]),
    });
  }
  return rows;
}

function parseCellAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "-" || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCellText(value: unknown): string | null {
  if (value === null || value === undefined || value === "-" || value === "") return null;
  return String(value).trim();
}

function parseCellDate(value: unknown): string | null {
  if (!(value instanceof Date)) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type ImportGroupKind = "tuition" | "insurance";

export type ImportGroup = {
  rowNumber: number;
  kind: ImportGroupKind;
  studentCode: string;
  studentName: string;
  /** Only meaningful for "tuition" groups; null means neither เบิกได้/เบิกไม่ได้ was populated. */
  expectedIsReimbursable: boolean | null;
  /** Sum of positive cell values in this group — actual cash collected. */
  netCash: number;
  /** Sum of |negative cell values| in this group — amount written off. */
  discount: number;
  /** netCash + discount — must equal the matched invoice's gross total_amount. */
  groupTotal: number;
  voucher: string | null;
  paidDateIso: string | null;
};

/** Splits one sheet row into up to 2 independent import groups (tuition, insurance). */
export function buildImportGroups(row: XlsxSheetRow): ImportGroup[] {
  const groups: ImportGroup[] = [];

  const tuitionCells = [
    row.reimbursableAmount,
    row.nonReimbursableAmount,
    row.lunchAmount,
    row.documentAmount,
    row.foreignTeacherAmount,
  ].filter((v): v is number => v !== null);

  if (tuitionCells.length > 0) {
    const netCash = round2(tuitionCells.filter((v) => v > 0).reduce((s, v) => s + v, 0));
    const discount = round2(
      tuitionCells.filter((v) => v < 0).reduce((s, v) => s - v, 0),
    );
    groups.push({
      rowNumber: row.rowNumber,
      kind: "tuition",
      studentCode: row.studentCode,
      studentName: row.studentName,
      expectedIsReimbursable:
        row.reimbursableAmount !== null
          ? true
          : row.nonReimbursableAmount !== null
            ? false
            : null,
      netCash,
      discount,
      groupTotal: round2(netCash + discount),
      voucher: row.tuitionVoucher,
      paidDateIso: row.paidDateIso,
    });
  }

  if (row.insuranceAmount !== null) {
    const netCash = row.insuranceAmount > 0 ? round2(row.insuranceAmount) : 0;
    const discount = row.insuranceAmount < 0 ? round2(-row.insuranceAmount) : 0;
    groups.push({
      rowNumber: row.rowNumber,
      kind: "insurance",
      studentCode: row.studentCode,
      studentName: row.studentName,
      expectedIsReimbursable: null,
      netCash,
      discount,
      groupTotal: round2(netCash + discount),
      voucher: row.insuranceVoucher,
      paidDateIso: row.paidDateIso,
    });
  }

  return groups;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
