import { describe, expect, it } from "vitest";
import { parseSemesterNumber, resolveSemesterContext } from "@/lib/context/semester-params";

const years = [
  { id: "y-active", name: "2568", is_active: true },
  { id: "y-old", name: "2567", is_active: false },
];

const semesters = [
  { id: "s1-active", academic_year_id: "y-active", number: 1, name: null },
  { id: "s3-active", academic_year_id: "y-active", number: 3, name: null },
  { id: "s1-old", academic_year_id: "y-old", number: 1, name: null },
];

describe("parseSemesterNumber", () => {
  it("accepts available numbers", () => {
    expect(parseSemesterNumber("3", [1, 3])).toBe(3);
    expect(parseSemesterNumber("1", [1, 3])).toBe(1);
  });

  it("defaults to lowest available when invalid", () => {
    expect(parseSemesterNumber(undefined, [1, 3])).toBe(1);
    expect(parseSemesterNumber("2", [1, 3])).toBe(1);
  });
});

describe("resolveSemesterContext", () => {
  it("uses year and semester params when valid", () => {
    const ctx = resolveSemesterContext("y-active", "3", years, semesters);
    expect(ctx?.semesterId).toBe("s3-active");
    expect(ctx?.semesterNumber).toBe(3);
  });

  it("defaults to active year and lowest semester", () => {
    const ctx = resolveSemesterContext(undefined, undefined, years, semesters);
    expect(ctx?.academicYearId).toBe("y-active");
    expect(ctx?.semesterId).toBe("s1-active");
  });
});
