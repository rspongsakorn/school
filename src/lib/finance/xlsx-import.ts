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
  equipmentAmount: number | null; // ค่าเครื่องใช้
  foreignTeacherAmount: number | null; // ค่าครูสอนภาษาต่างประเทศ
  abacusAmount: number | null; // ค่าเรียนจินตคณิต
  airconRoomAmount: number | null; // ค่าห้องปรับอากาศ
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
  EQUIPMENT: 10,
  FOREIGN_TEACHER: 11,
  ABACUS: 12,
  AIRCON_ROOM: 13,
  INSURANCE_VOUCHER: 14,
  PAID_DATE: 15,
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
      equipmentAmount: parseCellAmount(cells[COL.EQUIPMENT]),
      foreignTeacherAmount: parseCellAmount(cells[COL.FOREIGN_TEACHER]),
      abacusAmount: parseCellAmount(cells[COL.ABACUS]),
      airconRoomAmount: parseCellAmount(cells[COL.AIRCON_ROOM]),
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

/**
 * Staff routinely type the paid date as a 2-digit Buddhist-era year, e.g.
 * "5/5/69" meaning 5 May 2569 BE (2026 CE). Excel has no concept of the
 * Buddhist calendar: it treats "69" as a 2-digit CE year and — per its
 * standard short-year rule (00-29 -> 20xx, 30-99 -> 19xx) — stores it as
 * 1969, not 2026. No genuine historical payment in this system predates
 * 2000, so any parsed year below that threshold is unambiguously this
 * mis-entry, correctable by re-deriving the intended year from the same
 * 2-digit value: last two digits + 2500 (BE) - 543 (CE offset), which
 * simplifies to "+57" for the 1930-1999 range Excel actually produces
 * for a typed "30"-"99".
 */
function correctBuddhistShortYear(year: number): number {
  return year < 2000 ? year + 57 : year;
}

function parseCellDate(value: unknown): string | null {
  if (!(value instanceof Date)) return null;
  const y = correctBuddhistShortYear(value.getFullYear());
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type ImportGroupKind = "tuition" | "insurance";

/** One sheet column that can carry a fee amount (positive = cash, negative = discount). */
export type DiscountColumn =
  | "reimbursable"
  | "nonReimbursable"
  | "lunch"
  | "document"
  | "insurance"
  | "equipment"
  | "foreignTeacher"
  | "abacus"
  | "airconRoom";

/** Substring matched against fee_items.name to find the invoice_line a column's discount applies to. */
export const DISCOUNT_COLUMN_KEYWORDS: Record<DiscountColumn, string> = {
  reimbursable: "เทอม",
  nonReimbursable: "เทอม",
  lunch: "อาหาร",
  document: "เอกสาร",
  insurance: "ประกัน",
  equipment: "เครื่องใช้",
  foreignTeacher: "ต่างชาติ",
  abacus: "จินตคณิต",
  airconRoom: "ห้องปรับอากาศ",
};

export type DiscountLine = {
  column: DiscountColumn;
  amount: number;
};

export type ImportGroup = {
  rowNumber: number;
  kind: ImportGroupKind;
  studentCode: string;
  studentName: string;
  /** Sheet columns populated in this group — used to disambiguate which invoice a "tuition" group belongs to. */
  columns: DiscountColumn[];
  /** Only meaningful for "tuition" groups; null means neither เบิกได้/เบิกไม่ได้ was populated. */
  expectedIsReimbursable: boolean | null;
  /** Sum of positive cell values in this group — actual cash collected. */
  netCash: number;
  /** Sum of |negative cell values| in this group — amount written off. */
  discount: number;
  /** Per-column breakdown of the negative cells that make up `discount`. */
  discountLines: DiscountLine[];
  /** netCash + discount — must equal the matched invoice's gross total_amount. */
  groupTotal: number;
  voucher: string | null;
  paidDateIso: string | null;
};

/** Splits one sheet row into up to 2 independent import groups (tuition, insurance). */
export function buildImportGroups(row: XlsxSheetRow): ImportGroup[] {
  const groups: ImportGroup[] = [];

  const tuitionColumns = [
    { column: "reimbursable", value: row.reimbursableAmount },
    { column: "nonReimbursable", value: row.nonReimbursableAmount },
    { column: "lunch", value: row.lunchAmount },
    { column: "document", value: row.documentAmount },
    { column: "foreignTeacher", value: row.foreignTeacherAmount },
    { column: "equipment", value: row.equipmentAmount },
    { column: "abacus", value: row.abacusAmount },
    { column: "airconRoom", value: row.airconRoomAmount },
  ].filter((c): c is { column: DiscountColumn; value: number } => c.value !== null);

  if (tuitionColumns.length > 0) {
    const netCash = round2(
      tuitionColumns.filter((c) => c.value > 0).reduce((s, c) => s + c.value, 0),
    );
    const discountLines: DiscountLine[] = tuitionColumns
      .filter((c) => c.value < 0)
      .map((c) => ({ column: c.column, amount: round2(-c.value) }));
    const discount = round2(discountLines.reduce((s, d) => s + d.amount, 0));
    groups.push({
      rowNumber: row.rowNumber,
      kind: "tuition",
      studentCode: row.studentCode,
      studentName: row.studentName,
      columns: tuitionColumns.map((c) => c.column),
      expectedIsReimbursable:
        row.reimbursableAmount !== null
          ? true
          : row.nonReimbursableAmount !== null
            ? false
            : null,
      netCash,
      discount,
      discountLines,
      groupTotal: round2(netCash + discount),
      voucher: row.tuitionVoucher,
      paidDateIso: row.paidDateIso,
    });
  }

  if (row.insuranceAmount !== null) {
    const netCash = row.insuranceAmount > 0 ? round2(row.insuranceAmount) : 0;
    const discountLines: DiscountLine[] =
      row.insuranceAmount < 0 ? [{ column: "insurance", amount: round2(-row.insuranceAmount) }] : [];
    const discount = round2(discountLines.reduce((s, d) => s + d.amount, 0));
    groups.push({
      rowNumber: row.rowNumber,
      kind: "insurance",
      studentCode: row.studentCode,
      studentName: row.studentName,
      columns: ["insurance"],
      expectedIsReimbursable: null,
      netCash,
      discount,
      discountLines,
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

  let candidates =
    group.kind === "insurance"
      ? invoices.filter(isInsuranceInvoice)
      : invoices.filter((inv) => !isInsuranceInvoice(inv));

  // Normally a student has exactly one non-insurance invoice. Some students
  // are billed extra fees (e.g. lunch) as a standalone invoice instead of a
  // line on the tuition invoice — when that leaves more than one candidate,
  // narrow to invoices whose fee items overlap with this group's populated
  // columns (e.g. a row with no lunchAmount shouldn't match the lunch invoice).
  if (group.kind === "tuition" && candidates.length > 1) {
    const keywords = group.columns.map((c) => DISCOUNT_COLUMN_KEYWORDS[c]);
    const narrowed = candidates.filter((inv) =>
      inv.feeItemNames.some((name) => keywords.some((kw) => name.includes(kw))),
    );
    if (narrowed.length > 0) candidates = narrowed;
  }

  if (candidates.length === 0) {
    return { ok: false, reason: "ไม่พบใบแจ้งหนี้ที่ตรงกัน" };
  }
  if (candidates.length > 1) {
    return { ok: false, reason: "พบใบแจ้งหนี้มากกว่า 1 ใบ" };
  }

  const invoice = candidates[0];

  if (invoice.status !== "unpaid") {
    return { ok: false, reason: "ใบแจ้งหนี้นี้มีการชำระแล้ว" };
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
