import { describe, expect, it } from "vitest";
import { defaultSemesterDates } from "./semester-dates";

describe("defaultSemesterDates", () => {
  it("splits year into two contiguous halves", () => {
    const result = defaultSemesterDates("2025-05-01", "2026-04-30");
    expect(result.semester1.start).toBe("2025-05-01");
    expect(result.semester1.end).toBe("2025-10-30");
    expect(result.semester2.start).toBe("2025-10-31");
    expect(result.semester2.end).toBe("2026-04-30");
  });
});
