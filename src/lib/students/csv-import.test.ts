import { describe, expect, it } from "vitest";
import {
  assertRequiredHeaders,
  importRowToCsvInput,
  mapGenderLabel,
  parseCsvText,
  parseThaiBirthdateShort,
  validateAndBuildImportRows,
  type ImportStudentRow,
} from "@/lib/students/csv-import";

describe("parseCsvText", () => {
  it("parses quoted fields with commas", () => {
    const rows = parseCsvText('a,b\n1,"hello, world"');
    expect(rows[1][1]).toBe("hello, world");
  });
});

describe("assertRequiredHeaders", () => {
  it("returns null when all required headers present", () => {
    expect(
      assertRequiredHeaders([
        "id_card",
        "student_code",
        "gender",
        "first_name",
        "last_name",
        "birthdate",
      ]),
    ).toBeNull();
  });

  it("lists missing headers", () => {
    expect(assertRequiredHeaders(["student_code"])).toMatch(/birthdate/);
  });
});

describe("mapGenderLabel", () => {
  it("maps เด็กหญิง to female", () => {
    expect(mapGenderLabel("เด็กหญิง")).toBe("female");
  });

  it("maps เด็กชาย to male", () => {
    expect(mapGenderLabel("เด็กชาย")).toBe("male");
  });

  it("returns null for unknown", () => {
    expect(mapGenderLabel("unknown")).toBeNull();
  });
});

describe("parseThaiBirthdateShort", () => {
  it("parses 21 เม.ย. 55 to 2012-04-21", () => {
    expect(parseThaiBirthdateShort("21 เม.ย. 55")).toBe("2012-04-21");
  });

  it("returns null for invalid text", () => {
    expect(parseThaiBirthdateShort("not a date")).toBeNull();
  });
});

describe("validateAndBuildImportRows", () => {
  const baseRow = {
    rowNumber: 2,
    student_code: "12390",
    first_name: "ทดสอบ",
    last_name: "นามสกุล",
    gender: "เด็กชาย",
    birthdate: "25 ก.ค. 54",
    id_card: "",
  };

  it("builds ready row when valid", () => {
    const result = validateAndBuildImportRows([baseRow], new Set());
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].studentCode).toBe("12390");
    expect(result.ready[0].classroom).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it("errors when student_code exists in DB", () => {
    const result = validateAndBuildImportRows([baseRow], new Set(["12390"]));
    expect(result.ready).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/มีในระบบแล้ว/);
  });

  it("re-validates ImportStudentRow after importRowToCsvInput round-trip", () => {
    const row = {
      studentCode: "12390",
      firstName: "ทดสอบ",
      lastName: "นามสกุล",
      gender: "male" as const,
      dateOfBirth: "2012-04-21",
      idCard: null,
      classroom: null,
    };
    const csvRow = importRowToCsvInput(row, 2);
    const result = validateAndBuildImportRows([csvRow], new Set());
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].dateOfBirth).toBe("2012-04-21");
    expect(result.errors).toHaveLength(0);
  });

  it("errors duplicate code in file on second row", () => {
    const result = validateAndBuildImportRows(
      [baseRow, { ...baseRow, rowNumber: 3 }],
      new Set(),
    );
    expect(result.ready).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/ซ้ำในไฟล์/);
  });

  it("captures valid classroom from row", () => {
    const result = validateAndBuildImportRows(
      [{ ...baseRow, classroom: "ม.2/1" }],
      new Set(),
    );
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].classroom).toEqual({
      gradeName: "ม.2",
      classroomNumber: "1",
    });
  });

  it("treats empty classroom as null", () => {
    const result = validateAndBuildImportRows(
      [{ ...baseRow, classroom: "" }],
      new Set(),
    );
    expect(result.ready[0].classroom).toBeNull();
  });

  it("treats omitted classroom field as null", () => {
    const result = validateAndBuildImportRows([baseRow], new Set());
    expect(result.ready[0].classroom).toBeNull();
  });

  it("errors on classroom parse failure", () => {
    const result = validateAndBuildImportRows(
      [{ ...baseRow, classroom: "ม.2" }],
      new Set(),
    );
    expect(result.ready).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/ห้องเรียน/);
  });

  it("re-validates classroom round-trip via importRowToCsvInput", () => {
    const row: ImportStudentRow = {
      studentCode: "12390",
      firstName: "ทดสอบ",
      lastName: "นามสกุล",
      gender: "male" as const,
      dateOfBirth: "2012-04-21",
      idCard: null,
      classroom: { gradeName: "ม.2", classroomNumber: "1" },
    };
    const csvRow = importRowToCsvInput(row, 2);
    expect(csvRow.classroom).toBe("ม.2/1");
    const result = validateAndBuildImportRows([csvRow], new Set());
    expect(result.ready[0].classroom).toEqual({
      gradeName: "ม.2",
      classroomNumber: "1",
    });
  });
});

import { parseClassroomCell } from "@/lib/students/csv-import";

describe("parseClassroomCell", () => {
  it("returns empty for empty string", () => {
    expect(parseClassroomCell("")).toEqual({ ok: true, empty: true });
  });

  it("returns empty for whitespace only", () => {
    expect(parseClassroomCell("   ")).toEqual({ ok: true, empty: true });
  });

  it("splits ม.2/1 into grade and classroom number", () => {
    expect(parseClassroomCell("ม.2/1")).toEqual({
      ok: true,
      empty: false,
      gradeName: "ม.2",
      classroomNumber: "1",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseClassroomCell("  ม.2/1  ")).toEqual({
      ok: true,
      empty: false,
      gradeName: "ม.2",
      classroomNumber: "1",
    });
  });

  it("errors when no slash", () => {
    const r = parseClassroomCell("ม.2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ชั้น\/เลขห้อง/);
  });

  it("errors when grade is empty", () => {
    const r = parseClassroomCell("/1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ขาดชื่อชั้น/);
  });

  it("errors when classroom number is empty", () => {
    const r = parseClassroomCell("ม.2/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/เลขห้อง/);
  });

  it("errors when classroom number is non-numeric", () => {
    const r = parseClassroomCell("ม.2/abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/เลขห้อง/);
  });

  it("errors when classroom number out of range (0)", () => {
    const r = parseClassroomCell("ม.2/0");
    expect(r.ok).toBe(false);
  });

  it("errors when classroom number out of range (1000)", () => {
    const r = parseClassroomCell("ม.2/1000");
    expect(r.ok).toBe(false);
  });

  it("splits on first slash only", () => {
    const r = parseClassroomCell("ม.2/1/extra");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/เลขห้อง/);
  });
});
