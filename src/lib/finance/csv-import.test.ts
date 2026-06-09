import { describe, expect, it } from "vitest";
import { parseBuddhistDate, parsePaymentCsv } from "./csv-import";

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
