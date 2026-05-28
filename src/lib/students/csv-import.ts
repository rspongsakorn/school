import {
  formatThaiBirthdateShort,
  isFutureIsoDate,
  THAI_MONTHS_SHORT,
} from "@/lib/students/dates";
import { CSV_REQUIRED_HEADERS } from "@/lib/students/csv-format";
import type { StudentGender } from "@/lib/students/constants";

export type CsvStudentRow = Record<string, string>;

export type CsvStudentInputRow = {
  rowNumber: number;
  id_card?: string;
  student_code?: string;
  gender?: string;
  first_name?: string;
  last_name?: string;
  birthdate?: string;
};

export type ImportStudentRow = {
  studentCode: string;
  firstName: string;
  lastName: string;
  gender: StudentGender;
  dateOfBirth: string;
  idCard: string | null;
};

export type ImportRowError = {
  row: number;
  studentCode?: string;
  message: string;
};

const THAI_BE_TWO_DIGIT_BASE = 2500;

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || (char === "\r" && next === "\n")) {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      if (char === "\r") i += 1;
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  return rows;
}

export function normalizeHeaderRow(cells: string[]): string[] {
  return cells.map((cell) => cell.trim().replace(/^\uFEFF/, ""));
}

export function assertRequiredHeaders(header: string[]): string | null {
  const missing = CSV_REQUIRED_HEADERS.filter((key) => !header.includes(key));
  if (missing.length === 0) return null;
  return `คอลัมน์ที่ขาด: ${missing.join(", ")}`;
}

export function csvRowsToObjects(header: string[], dataRows: string[][]): CsvStudentInputRow[] {
  return dataRows.map((cells, index) => {
    const row: CsvStudentInputRow = { rowNumber: index + 2 };
    header.forEach((key, colIndex) => {
      if (key === "id_card") row.id_card = (cells[colIndex] ?? "").trim();
      else if (key === "student_code") row.student_code = (cells[colIndex] ?? "").trim();
      else if (key === "gender") row.gender = (cells[colIndex] ?? "").trim();
      else if (key === "first_name") row.first_name = (cells[colIndex] ?? "").trim();
      else if (key === "last_name") row.last_name = (cells[colIndex] ?? "").trim();
      else if (key === "birthdate") row.birthdate = (cells[colIndex] ?? "").trim();
    });
    return row;
  });
}

export function mapGenderLabel(label: string): StudentGender | null {
  const value = label.trim();
  if (value === "เด็กชาย" || value === "นาย") return "male";
  if (value === "เด็กหญิง" || value === "นาง" || value === "นางสาว") return "female";
  return null;
}

export function parseThaiBirthdateShort(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthToken = match[2];
  const monthIndex = THAI_MONTHS_SHORT.indexOf(
    monthToken as (typeof THAI_MONTHS_SHORT)[number],
  );
  if (monthIndex === -1) return null;

  const beYear = THAI_BE_TWO_DIGIT_BASE + Number(match[3]);
  const ceYear = beYear - 543;
  const iso = `${ceYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  if (isFutureIsoDate(iso)) return null;

  const [y, m, d] = iso.split("-").map(Number);
  const check = new Date(y, m - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) {
    return null;
  }

  return iso;
}

export function validateAndBuildImportRows(
  rows: CsvStudentInputRow[],
  existingCodes: Set<string>,
): { ready: ImportStudentRow[]; errors: ImportRowError[] } {
  const seenInFile = new Set<string>();
  const ready: ImportStudentRow[] = [];
  const errors: ImportRowError[] = [];

  for (const row of rows) {
    const code = row.student_code?.trim() ?? "";
    const firstName = row.first_name?.trim() ?? "";
    const lastName = row.last_name?.trim() ?? "";
    const genderLabel = row.gender?.trim() ?? "";
    const birthdate = row.birthdate?.trim() ?? "";

    const pushError = (message: string) => {
      errors.push({
        row: row.rowNumber,
        studentCode: code || undefined,
        message,
      });
    };

    if (!code || !firstName || !lastName || !genderLabel || !birthdate) {
      pushError("ข้อมูลไม่ครบ");
      continue;
    }

    if (existingCodes.has(code)) {
      pushError("รหัสนักเรียนนี้มีในระบบแล้ว");
      continue;
    }

    if (seenInFile.has(code)) {
      pushError("รหัสนักเรียนซ้ำในไฟล์ (แถวนี้)");
      continue;
    }

    const gender = mapGenderLabel(genderLabel);
    if (!gender) {
      pushError("ไม่รู้จักคำนำหน้า/เพศ");
      continue;
    }

    const dateOfBirth = parseThaiBirthdateShort(birthdate);
    if (!dateOfBirth) {
      pushError("รูปแบบวันเกิดไม่ถูกต้องหรือเป็นวันในอนาคต");
      continue;
    }

    seenInFile.add(code);
    ready.push({
      studentCode: code,
      firstName,
      lastName,
      gender,
      dateOfBirth,
      idCard: row.id_card?.trim() || null,
    });
  }

  return { ready, errors };
}

export function importRowToCsvInput(row: ImportStudentRow, rowNumber: number): CsvStudentInputRow {
  return {
    rowNumber,
    student_code: row.studentCode,
    first_name: row.firstName,
    last_name: row.lastName,
    gender: row.gender === "male" ? "เด็กชาย" : "เด็กหญิง",
    birthdate: formatThaiBirthdateShort(row.dateOfBirth),
    id_card: row.idCard ?? "",
  };
}

export type ParsedClassroom =
  | { ok: true; empty: true }
  | { ok: true; empty: false; gradeName: string; classroomNumber: string }
  | { ok: false; error: string };

export function parseClassroomCell(raw: string): ParsedClassroom {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, empty: true };

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex === -1) {
    return { ok: false, error: "ต้องระบุในรูปแบบ ชั้น/เลขห้อง" };
  }

  const gradeName = trimmed.slice(0, slashIndex).trim();
  const classroomNumber = trimmed.slice(slashIndex + 1).trim();

  if (!gradeName) return { ok: false, error: "ขาดชื่อชั้นเรียน" };

  if (!/^\d+$/.test(classroomNumber)) {
    return { ok: false, error: "เลขห้องต้องเป็นตัวเลข 1–999" };
  }
  const num = Number(classroomNumber);
  if (num < 1 || num > 999) {
    return { ok: false, error: "เลขห้องต้องเป็นตัวเลข 1–999" };
  }

  return { ok: true, empty: false, gradeName, classroomNumber };
}
