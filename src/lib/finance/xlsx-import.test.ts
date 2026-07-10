import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildImportGroups, parseXlsxWorkbook, type XlsxSheetRow } from "@/lib/finance/xlsx-import";

function makeRow(overrides: Partial<XlsxSheetRow> = {}): XlsxSheetRow {
  return {
    rowNumber: 4,
    studentCode: "13777",
    studentName: "ศิริลัดดา คชรินทร์",
    reimbursableAmount: null,
    nonReimbursableAmount: 2000,
    lunchAmount: null,
    documentAmount: 400,
    insuranceAmount: -200,
    foreignTeacherAmount: 500,
    tuitionVoucher: "53-2606",
    insuranceVoucher: null,
    paidDateIso: "2026-05-05",
    ...overrides,
  };
}

describe("buildImportGroups", () => {
  it("splits a row into a tuition group and an insurance group", () => {
    const groups = buildImportGroups(makeRow());
    expect(groups).toHaveLength(2);

    const tuition = groups.find((g) => g.kind === "tuition")!;
    expect(tuition.netCash).toBe(2900);
    expect(tuition.discount).toBe(0);
    expect(tuition.groupTotal).toBe(2900);
    expect(tuition.expectedIsReimbursable).toBe(false);
    expect(tuition.voucher).toBe("53-2606");

    const insurance = groups.find((g) => g.kind === "insurance")!;
    expect(insurance.netCash).toBe(0);
    expect(insurance.discount).toBe(200);
    expect(insurance.groupTotal).toBe(200);
  });

  it("omits the insurance group when insuranceAmount is null", () => {
    const groups = buildImportGroups(makeRow({ insuranceAmount: null }));
    expect(groups.map((g) => g.kind)).toEqual(["tuition"]);
  });

  it("omits the tuition group when all tuition-composing cells are null", () => {
    const groups = buildImportGroups(
      makeRow({
        nonReimbursableAmount: null,
        reimbursableAmount: null,
        lunchAmount: null,
        documentAmount: null,
        foreignTeacherAmount: null,
      }),
    );
    expect(groups.map((g) => g.kind)).toEqual(["insurance"]);
  });

  it("sets expectedIsReimbursable true when เบิกได้ is populated", () => {
    const groups = buildImportGroups(
      makeRow({ reimbursableAmount: 2900, nonReimbursableAmount: null }),
    );
    const tuition = groups.find((g) => g.kind === "tuition")!;
    expect(tuition.expectedIsReimbursable).toBe(true);
  });

  it("handles a partial discount mixed with cash in the same group", () => {
    const groups = buildImportGroups(
      makeRow({ nonReimbursableAmount: 1800, documentAmount: -100 }),
    );
    const tuition = groups.find((g) => g.kind === "tuition")!;
    // 1800 (cash) + 500 (foreignTeacher, from base fixture) = 2300 net cash
    expect(tuition.netCash).toBe(2300);
    expect(tuition.discount).toBe(100);
    expect(tuition.groupTotal).toBe(2400);
  });

  it("sums two simultaneous negative cells into a single discount", () => {
    const groups = buildImportGroups(
      makeRow({ documentAmount: -100, lunchAmount: -50 }),
    );
    const tuition = groups.find((g) => g.kind === "tuition")!;
    // cash: 2000 (nonReimbursable) + 500 (foreignTeacher) = 2500
    // discount: 100 (document) + 50 (lunch) = 150
    expect(tuition.netCash).toBe(2500);
    expect(tuition.discount).toBe(150);
    expect(tuition.groupTotal).toBe(2650);
  });
});

describe("parseXlsxWorkbook", () => {
  it("maps columns correctly from a real-shaped sheet", () => {
    const paidDate = new Date(2026, 4, 5); // 2026-05-05
    const aoa = [
      ["ห้อง ป.1/1"], // row 1: class label
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
        "ค่าครูต่างชาติ",
        "ใบสำคัญ",
        "วันที่ชำระ",
      ], // row 3: headers
      [
        1,
        "13777",
        "ศิริลัดดา",
        "คชรินทร์",
        "-",
        "53-2606",
        2000,
        "-",
        400,
        -200,
        500,
        "-",
        paidDate,
      ], // row 4: data
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const rows = parseXlsxWorkbook(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      rowNumber: 4,
      studentCode: "13777",
      studentName: "ศิริลัดดา คชรินทร์",
      reimbursableAmount: null,
      nonReimbursableAmount: 2000,
      lunchAmount: null,
      documentAmount: 400,
      insuranceAmount: -200,
      foreignTeacherAmount: 500,
      tuitionVoucher: "53-2606",
      insuranceVoucher: null,
      paidDateIso: "2026-05-05",
    });
  });
});
