import { describe, expect, it } from "vitest";
import { formatReceiptNumber, parseMaxSequence } from "./receipt-number";

describe("receipt-number", () => {
  it("formats with padded sequence", () => {
    expect(formatReceiptNumber("2568", 42)).toBe("2568/00042");
  });

  it("parses max sequence for year", () => {
    expect(
      parseMaxSequence(["2568/00001", "2568/00012", "2567/99999"], "2568"),
    ).toBe(12);
  });
});
