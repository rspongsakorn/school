import { describe, expect, it } from "vitest";
import { feeItemLockedFieldsChanged } from "@/lib/finance/fee-item-edit-eligibility";

const base = {
  name: "ค่าเทอม",
  description: "เทอมต้น" as string | null,
  isTuition: true,
  hasReimbursableVariant: false,
};

describe("feeItemLockedFieldsChanged", () => {
  it("returns false when nothing changed", () => {
    expect(feeItemLockedFieldsChanged(base, { ...base })).toBe(false);
  });

  it("returns true when name changes", () => {
    expect(feeItemLockedFieldsChanged(base, { ...base, name: "ค่าเทอมใหม่" })).toBe(true);
  });

  it("returns true when isTuition changes", () => {
    expect(feeItemLockedFieldsChanged(base, { ...base, isTuition: false })).toBe(true);
  });

  it("returns true when hasReimbursableVariant changes", () => {
    expect(
      feeItemLockedFieldsChanged(base, { ...base, hasReimbursableVariant: true }),
    ).toBe(true);
  });

  it("returns true when description changes", () => {
    expect(feeItemLockedFieldsChanged(base, { ...base, description: "เทอมปลาย" })).toBe(true);
  });

  it("treats null and empty-string description as equal", () => {
    expect(
      feeItemLockedFieldsChanged(
        { ...base, description: null },
        { ...base, description: "" },
      ),
    ).toBe(false);
  });
});
