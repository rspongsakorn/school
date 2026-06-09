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
