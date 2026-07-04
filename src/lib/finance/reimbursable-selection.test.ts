import { describe, expect, it } from "vitest";
import { defaultReimbursableIds } from "@/lib/finance/reimbursable-selection";

describe("defaultReimbursableIds", () => {
  it("returns ids of candidates flagged defaultReimbursable", () => {
    const result = defaultReimbursableIds([
      { studentId: "a", defaultReimbursable: true },
      { studentId: "b", defaultReimbursable: false },
      { studentId: "c", defaultReimbursable: true },
    ]);
    expect(result).toEqual(new Set(["a", "c"]));
  });

  it("returns an empty set when none are flagged", () => {
    const result = defaultReimbursableIds([
      { studentId: "a", defaultReimbursable: false },
    ]);
    expect(result).toEqual(new Set());
  });

  it("returns an empty set for an empty list", () => {
    expect(defaultReimbursableIds([])).toEqual(new Set());
  });
});
