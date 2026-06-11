import { describe, expect, it } from "vitest";
import { partitionRateEntriesByLock } from "@/lib/finance/fee-rate-edit-eligibility";

const e = (gradeLevelId: string, feeItemId: string) => ({ gradeLevelId, feeItemId });

describe("partitionRateEntriesByLock", () => {
  it("returns all as allowed when no locked grades", () => {
    const entries = [e("g1", "i1"), e("g2", "i1")];
    const { allowed, locked } = partitionRateEntriesByLock(entries, new Set());
    expect(allowed).toHaveLength(2);
    expect(locked).toHaveLength(0);
  });

  it("moves locked-grade entries to locked", () => {
    const entries = [e("g1", "i1"), e("g2", "i1")];
    const { allowed, locked } = partitionRateEntriesByLock(entries, new Set(["g1"]));
    expect(allowed).toEqual([e("g2", "i1")]);
    expect(locked).toEqual([e("g1", "i1")]);
  });

  it("returns all as locked when every grade is locked", () => {
    const entries = [e("g1", "i1"), e("g2", "i2")];
    const { allowed, locked } = partitionRateEntriesByLock(
      entries,
      new Set(["g1", "g2"]),
    );
    expect(allowed).toHaveLength(0);
    expect(locked).toHaveLength(2);
  });
});
