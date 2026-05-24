import { describe, expect, it } from "vitest";
import { validateSemesterForm, validateYearForm } from "@/lib/academic-year/form-validation";

describe("validateYearForm", () => {
  it("returns field errors for invalid year input", () => {
    const result = validateYearForm({ name: "", startDate: "", endDate: "2025-01-01" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.startDate).toBeTruthy();
    }
  });
});

describe("validateSemesterForm", () => {
  it("returns field errors for invalid semester dates", () => {
    const result = validateSemesterForm(
      { startDate: "2025-06-01", endDate: "2025-05-01" },
      1,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.endDate).toContain("ภาคเรียนที่ 1");
    }
  });
});
