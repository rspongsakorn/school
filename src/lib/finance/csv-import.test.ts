import { describe, expect, it } from "vitest";
import {
  assessImportRow,
  parseBuddhistDate,
  parsePaymentCsv,
} from "./csv-import";

describe("parseBuddhistDate", () => {
  it("parses DD/MM/YYYY Buddhist date to ISO CE date", () => {
    expect(parseBuddhistDate("06/05/2569")).toBe("2026-05-06");
  });
  it("accepts single-digit day and month", () => {
    expect(parseBuddhistDate("6/5/2569")).toBe("2026-05-06");
  });
  it("returns null for wrong format", () => {
    expect(parseBuddhistDate("2026-05-06")).toBeNull();
  });
  it("returns null for impossible calendar date", () => {
    expect(parseBuddhistDate("31/02/2569")).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(parseBuddhistDate("")).toBeNull();
  });
});

describe("parsePaymentCsv", () => {
  const csv = [
    "student_code,student_name,amount,paid_date",
    "14333,นาลันทา ศรีวัฒนพงศ์,3600,06/05/2569",
    "14399,อลิสา มูลทา,2000,12/05/2569",
  ].join("\n");

  it("skips the header row and parses data rows", () => {
    const rows = parsePaymentCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      studentCode: "14333",
      studentName: "นาลันทา ศรีวัฒนพงศ์",
      amount: 3600,
      paidDateIso: "2026-05-06",
      error: null,
    });
  });
  it("ignores blank lines", () => {
    expect(parsePaymentCsv(csv + "\n\n")).toHaveLength(2);
  });
  it("flags a bad amount", () => {
    const rows = parsePaymentCsv("14399,อลิสา,abc,12/05/2569");
    expect(rows[0].error).toBe("ยอดเงินไม่ถูกต้อง");
  });
  it("flags a bad date", () => {
    const rows = parsePaymentCsv("14399,อลิสา,2000,2026-05-12");
    expect(rows[0].error).toBe("วันที่ไม่ถูกต้อง");
  });
  it("strips thousands separators in amount", () => {
    const rows = parsePaymentCsv('14399,อลิสา,"1,300",12/05/2569');
    expect(rows[0].amount).toBe(1300);
    expect(rows[0].error).toBeNull();
  });
});

describe("assessImportRow", () => {
  const base = {
    parseError: null,
    matchedStudentId: "s1",
    systemName: "อลิสา มูลทา",
    csvName: "อลิสา มูลทา",
    amount: 2000,
    outstanding: 2000,
  };

  it("marks a full payment", () => {
    expect(assessImportRow(base)).toEqual({
      status: "full",
      nameMismatch: false,
      willImport: true,
    });
  });
  it("marks a partial payment", () => {
    expect(assessImportRow({ ...base, amount: 1500 })).toMatchObject({
      status: "partial",
      willImport: true,
    });
  });
  it("blocks overpayment", () => {
    expect(assessImportRow({ ...base, amount: 2500 })).toMatchObject({
      status: "over",
      willImport: false,
    });
  });
  it("blocks zero outstanding", () => {
    expect(assessImportRow({ ...base, outstanding: 0 })).toMatchObject({
      status: "no_outstanding",
      willImport: false,
    });
  });
  it("blocks unmatched student", () => {
    expect(
      assessImportRow({ ...base, matchedStudentId: null, outstanding: null }),
    ).toMatchObject({ status: "not_found", willImport: false });
  });
  it("blocks parse errors", () => {
    expect(assessImportRow({ ...base, parseError: "วันที่ไม่ถูกต้อง" })).toMatchObject({
      status: "format_error",
      willImport: false,
    });
  });
  it("warns on name mismatch but still imports", () => {
    const r = assessImportRow({ ...base, csvName: "อลิสา มูลทาa" });
    expect(r.nameMismatch).toBe(true);
    expect(r.willImport).toBe(true);
  });
  it("treats whitespace-only name differences as matching", () => {
    const r = assessImportRow({ ...base, csvName: "อลิสา  มูลทา" });
    expect(r.nameMismatch).toBe(false);
  });
});
