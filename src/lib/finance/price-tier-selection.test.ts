import { describe, expect, it } from "vitest";
import { defaultPriceTiers } from "@/lib/finance/price-tier-selection";

describe("defaultPriceTiers", () => {
  it("maps each candidate to its student-level default tier", () => {
    const result = defaultPriceTiers([
      { studentId: "a", defaultPriceTier: "reimbursable" },
      { studentId: "b", defaultPriceTier: "standard" },
      { studentId: "c", defaultPriceTier: "private" },
    ]);
    expect(result).toEqual(
      new Map([
        ["a", "reimbursable"],
        ["b", "standard"],
        ["c", "private"],
      ]),
    );
  });

  it("returns an empty map for an empty list", () => {
    expect(defaultPriceTiers([])).toEqual(new Map());
  });
});
