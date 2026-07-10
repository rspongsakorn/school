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
  FOREIGN_TEACHER: 10,
  INSURANCE_VOUCHER: 11,
  PAID_DATE: 12,
} as const;

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

    const studentCode = String(cells[COL.STUDENT_CODE] ?? "").trim();
    if (!studentCode) continue;

    const firstName = String(cells[COL.FIRST_NAME] ?? "").trim();
    const lastName = String(cells[COL.LAST_NAME] ?? "").trim();

    rows.push({
      rowNumber: i + 1,
      studentCode,
      studentName: `${firstName} ${lastName}`.trim(),
      reimbursableAmount: parseCellAmount(cells[COL.REIMBURSABLE]),
      nonReimbursableAmount: parseCellAmount(cells[COL.NON_REIMBURSABLE]),
      lunchAmount: parseCellAmount(cells[COL.LUNCH]),
      documentAmount: parseCellAmount(cells[COL.DOCUMENT]),
      insuranceAmount: parseCellAmount(cells[COL.INSURANCE]),
      foreignTeacherAmount: parseCellAmount(cells[COL.FOREIGN_TEACHER]),
      tuitionVoucher: parseCellText(cells[COL.TUITION_VOUCHER]),
      insuranceVoucher: parseCellText(cells[COL.INSURANCE_VOUCHER]),
      paidDateIso: parseCellDate(cells[COL.PAID_DATE]),
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

export type InvoiceCandidate = {
  id: string;
  isReimbursable: boolean;
  totalAmount: number;
  status: "unpaid" | "partial" | "paid";
  /** fee_items.name for every invoice_lines row on this invoice. */
  feeItemNames: string[];
};

export type GroupValidationResult =
  | { ok: true; invoiceId: string }
  | { ok: false; reason: string };

const AMOUNT_EPSILON = 0.005;

/** Matches one import group against a student's invoice candidates and checks it's safe to import. */
export function validateGroup(
  group: ImportGroup,
  invoices: InvoiceCandidate[],
): GroupValidationResult {
  const isInsuranceInvoice = (inv: InvoiceCandidate) =>
    inv.feeItemNames.some((name) => name.includes("ประกัน"));

  const candidates =
    group.kind === "insurance"
      ? invoices.filter(isInsuranceInvoice)
      : invoices.filter((inv) => !isInsuranceInvoice(inv));

  if (candidates.length === 0) {
    return { ok: false, reason: "ไม่พบใบแจ้งหนี้ที่ตรงกัน" };
  }
  if (candidates.length > 1) {
    return { ok: false, reason: "พบใบแจ้งหนี้มากกว่า 1 ใบ" };
  }

  const invoice = candidates[0];

  if (invoice.status === "paid") {
    return { ok: false, reason: "ใบแจ้งหนี้นี้ชำระแล้ว" };
  }

  if (
    group.kind === "tuition" &&
    group.expectedIsReimbursable !== null &&
    invoice.isReimbursable !== group.expectedIsReimbursable
  ) {
    return { ok: false, reason: "สถานะเบิกได้/เบิกไม่ได้ไม่ตรงกับใบแจ้งหนี้" };
  }

  if (Math.abs(group.groupTotal - invoice.totalAmount) > AMOUNT_EPSILON) {
    return {
      ok: false,
      reason: `ยอดรวมไม่ตรงกับใบแจ้งหนี้ (ไฟล์ ${group.groupTotal} ≠ ระบบ ${invoice.totalAmount})`,
    };
  }

  return { ok: true, invoiceId: invoice.id };
}
