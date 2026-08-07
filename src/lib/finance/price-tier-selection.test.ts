import { describe, expect, it } from "vitest";
import { effectivePriceTiers } from "@/lib/finance/price-tier-selection";

const candidates = [
  { studentId: "a", defaultPriceTier: "reimbursable" as const },
  { studentId: "b", defaultPriceTier: "standard" as const },
  { studentId: "c", defaultPriceTier: "private" as const },
];

describe("effectivePriceTiers", () => {
  it("falls back to each student's own tier when nothing was overridden", () => {
    expect(effectivePriceTiers(candidates, new Map())).toEqual(
      new Map([
        ["a", "reimbursable"],
        ["b", "standard"],
        ["c", "private"],
      ]),
    );
  });

  it("lets an override win over the student's tier", () => {
    const result = effectivePriceTiers(candidates, new Map([["a", "private"]]));
    expect(result.get("a")).toBe("private");
    expect(result.get("b")).toBe("standard");
  });

  it("ignores overrides for students who are not candidates", () => {
    const result = effectivePriceTiers(candidates, new Map([["zz", "private"]]));
    expect(result.has("zz")).toBe(false);
    expect(result.size).toBe(3);
  });

  it("returns an empty map for an empty candidate list", () => {
    expect(effectivePriceTiers([], new Map([["a", "private"]]))).toEqual(new Map());
  });
});
