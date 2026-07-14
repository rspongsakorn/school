import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildImportGroups, parseXlsxWorkbook } from "@/lib/finance/xlsx-import";
import { SAMPLE_XLSX_FILENAME, XLSX_FORMAT_TABLE, buildSampleXlsxWorkbook } from "./xlsx-format";

describe("XLSX_FORMAT_TABLE", () => {
  it("documents all 15 data columns parseXlsxWorkbook reads, in sheet order", () => {
    expect(XLSX_FORMAT_TABLE.map((r) => r.key)).toEqual([
      "รหัสนักเรียน",
      "ชื่อ",
      "นามสกุล",
      "เบิกได้",
      "ใบสำคัญ (ค่าเล่าเรียน)",
      "เบิกไม่ได้",
      "ค่าอาหารกลางวัน",
      "ค่าเอกสาร",
      "ค่าประกัน",
      "ค่าเครื่องใช้",
      "ค่าครูต่างชาติ",
      "ค่าเรียนจินตคณิต",
      "ค่าห้องปรับอากาศ",
      "ใบสำคัญ (ประกัน)",
      "วันที่ชำระ",
    ]);
  });
});

describe("SAMPLE_XLSX_FILENAME", () => {
  it("ends with .xlsx", () => {
    expect(SAMPLE_XLSX_FILENAME.endsWith(".xlsx")).toBe(true);
  });
});

describe("buildSampleXlsxWorkbook", () => {
  it("produces a workbook parseXlsxWorkbook can read back into 2 valid rows", () => {
    const workbook = buildSampleXlsxWorkbook();
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const rows = parseXlsxWorkbook(buffer);
    expect(rows).toHaveLength(2);

    const [first, second] = rows;
    expect(first.studentCode).toBe("14333");
    expect(first.paidDateIso).toBe("2026-05-05");
    expect(second.studentCode).toBe("14399");
    expect(second.paidDateIso).toBe("2026-05-12");
  });

  it("exercises the 3 new fee columns across the 2 sample rows", () => {
    const workbook = buildSampleXlsxWorkbook();
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = parseXlsxWorkbook(buffer);

    const [first, second] = rows;
    expect(first.equipmentAmount).toBe(300);
    expect(first.abacusAmount).toBeNull();
    expect(first.airconRoomAmount).toBeNull();

    expect(second.equipmentAmount).toBeNull();
    expect(second.abacusAmount).toBe(200);
    expect(second.airconRoomAmount).toBe(150);
  });

  it("produces groups that would import cleanly (one เบิกได้ row, one เบิกไม่ได้ row)", () => {
    const workbook = buildSampleXlsxWorkbook();
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = parseXlsxWorkbook(buffer);
    const groups = rows.flatMap(buildImportGroups);

    const tuitionGroups = groups.filter((g) => g.kind === "tuition");
    expect(tuitionGroups).toHaveLength(2);
    expect(tuitionGroups[0].expectedIsReimbursable).toBe(true);
    expect(tuitionGroups[0].groupTotal).toBe(4400); // 3600 reimbursable + 500 lunch + 300 equipment
    expect(tuitionGroups[1].expectedIsReimbursable).toBe(false);
    expect(tuitionGroups[1].groupTotal).toBe(3650); // 2900 nonReimbursable + 400 document + 200 abacus + 150 airconRoom

    const insuranceGroups = groups.filter((g) => g.kind === "insurance");
    expect(insuranceGroups).toHaveLength(1);
    expect(insuranceGroups[0].groupTotal).toBe(300);
  });
});
