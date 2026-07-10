import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildImportGroups, parseXlsxWorkbook, validateGroup, type InvoiceCandidate, type XlsxSheetRow } from "@/lib/finance/xlsx-import";

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

function buildSheetBuffer(paidDate: Date): ArrayBuffer {
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
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseXlsxWorkbook", () => {
  it("maps columns correctly from a real-shaped sheet", () => {
    const buffer = buildSheetBuffer(new Date(2026, 4, 5)); // 2026-05-05

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

  it("corrects a 2-digit Buddhist-era year Excel misparsed as 19xx", () => {
    // Staff typed "5/5/69" meaning 5 May 2569 BE (2026 CE); Excel's
    // short-year rule stores that as 1969-05-05 in the cell.
    const buffer = buildSheetBuffer(new Date(1969, 4, 5));

    const rows = parseXlsxWorkbook(buffer);
    expect(rows[0].paidDateIso).toBe("2026-05-05");
  });

  it("leaves a genuine modern-era date untouched", () => {
    const buffer = buildSheetBuffer(new Date(2024, 11, 31));

    const rows = parseXlsxWorkbook(buffer);
    expect(rows[0].paidDateIso).toBe("2024-12-31");
  });
});

describe("validateGroup", () => {
  const tuitionGroup = buildImportGroups(makeRow())[0]; // kind: "tuition", groupTotal 2900, expectedIsReimbursable false
  const insuranceGroup = buildImportGroups(makeRow())[1]; // kind: "insurance", groupTotal 200

  const tuitionInvoice: InvoiceCandidate = {
    id: "inv-tuition",
    isReimbursable: false,
    totalAmount: 2900,
    status: "unpaid",
    feeItemNames: ["ค่าธรรมเนียมการศึกษา", "ค่าอาหารกลางวัน"],
  };
  const insuranceInvoice: InvoiceCandidate = {
    id: "inv-insurance",
    isReimbursable: false,
    totalAmount: 200,
    status: "unpaid",
    feeItemNames: ["ค่าประกันอุบัติเหตุ"],
  };

  it("matches a tuition group to the non-insurance invoice", () => {
    const result = validateGroup(tuitionGroup, [tuitionInvoice, insuranceInvoice]);
    expect(result).toEqual({ ok: true, invoiceId: "inv-tuition" });
  });

  it("matches an insurance group to the invoice whose fee item name contains ประกัน", () => {
    const result = validateGroup(insuranceGroup, [tuitionInvoice, insuranceInvoice]);
    expect(result).toEqual({ ok: true, invoiceId: "inv-insurance" });
  });

  it("rejects when no matching invoice exists", () => {
    const result = validateGroup(insuranceGroup, [tuitionInvoice]);
    expect(result).toEqual({ ok: false, reason: "ไม่พบใบแจ้งหนี้ที่ตรงกัน" });
  });

  it("rejects when more than one candidate invoice matches", () => {
    const result = validateGroup(tuitionGroup, [
      tuitionInvoice,
      { ...tuitionInvoice, id: "inv-tuition-2" },
    ]);
    expect(result).toEqual({ ok: false, reason: "พบใบแจ้งหนี้มากกว่า 1 ใบ" });
  });

  it("rejects when the invoice is already paid", () => {
    const result = validateGroup(tuitionGroup, [
      { ...tuitionInvoice, status: "paid" },
      insuranceInvoice,
    ]);
    expect(result).toEqual({ ok: false, reason: "ใบแจ้งหนี้นี้มีการชำระแล้ว" });
  });

  it("rejects when the invoice is partially paid", () => {
    const result = validateGroup(tuitionGroup, [
      { ...tuitionInvoice, status: "partial" },
      insuranceInvoice,
    ]);
    expect(result).toEqual({ ok: false, reason: "ใบแจ้งหนี้นี้มีการชำระแล้ว" });
  });

  it("rejects when เบิกได้/เบิกไม่ได้ doesn't match the invoice's is_reimbursable", () => {
    const result = validateGroup(tuitionGroup, [
      { ...tuitionInvoice, isReimbursable: true },
      insuranceInvoice,
    ]);
    expect(result).toEqual({
      ok: false,
      reason: "สถานะเบิกได้/เบิกไม่ได้ไม่ตรงกับใบแจ้งหนี้",
    });
  });

  it("rejects when groupTotal doesn't match the invoice's total_amount", () => {
    const result = validateGroup(tuitionGroup, [
      { ...tuitionInvoice, totalAmount: 3000 },
      insuranceInvoice,
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ยอดรวมไม่ตรงกับใบแจ้งหนี้");
  });
});
