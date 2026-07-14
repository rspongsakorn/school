import { describe, expect, it } from "vitest";
import { parsePaymentCsv } from "./csv-import";
import { CSV_FORMAT_TABLE, SAMPLE_CSV_CONTENT, SAMPLE_CSV_FILENAME } from "./csv-format";

describe("CSV_FORMAT_TABLE", () => {
  it("documents exactly the 5 columns parsePaymentCsv reads", () => {
    expect(CSV_FORMAT_TABLE.map((r) => r.key)).toEqual([
      "student_code",
      "first_name",
      "last_name",
      "amount",
      "paid_date",
    ]);
  });
});

describe("SAMPLE_CSV_CONTENT", () => {
  it("parses cleanly with no row errors", () => {
    const rows = parsePaymentCsv(SAMPLE_CSV_CONTENT);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.error).toBeNull();
    }
  });
});

describe("SAMPLE_CSV_FILENAME", () => {
  it("ends with .csv", () => {
    expect(SAMPLE_CSV_FILENAME.endsWith(".csv")).toBe(true);
  });
});
