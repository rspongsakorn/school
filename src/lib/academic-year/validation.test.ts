import { describe, expect, it } from "vitest";
import { isValidDateRange, isSemesterOutsideYear } from "./validation";

describe("isValidDateRange", () => {
  it("returns true when end >= start", () => {
    expect(isValidDateRange("2025-05-01", "2026-04-30")).toBe(true);
  });

  it("returns false when end < start", () => {
    expect(isValidDateRange("2026-04-30", "2025-05-01")).toBe(false);
  });
});

describe("isSemesterOutsideYear", () => {
  it("returns true when semester starts before year", () => {
    expect(
      isSemesterOutsideYear(
        { start: "2025-05-01", end: "2026-04-30" },
        { start: "2025-04-01", end: "2025-10-31" },
      ),
    ).toBe(true);
  });

  it("returns false when semester is inside year", () => {
    expect(
      isSemesterOutsideYear(
        { start: "2025-05-01", end: "2026-04-30" },
        { start: "2025-05-16", end: "2025-10-31" },
      ),
    ).toBe(false);
  });
});
