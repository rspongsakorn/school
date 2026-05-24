import { describe, expect, it } from "vitest";
import { parseSemesterNumber, resolveSemesterContext } from "@/lib/context/semester-params";

const years = [
  { id: "y-active", name: "2568", is_active: true },
  { id: "y-old", name: "2567", is_active: false },
];

const semesters = [
  { id: "s1-active", academic_year_id: "y-active", number: 1 as const, name: null },
  { id: "s2-active", academic_year_id: "y-active", number: 2 as const, name: null },
  { id: "s1-old", academic_year_id: "y-old", number: 1 as const, name: null },
];

describe("parseSemesterNumber", () => {
  it("accepts 1 and 2", () => {
    expect(parseSemesterNumber("1")).toBe(1);
    expect(parseSemesterNumber("2")).toBe(2);
  });

  it("defaults invalid to 1", () => {
    expect(parseSemesterNumber(undefined)).toBe(1);
    expect(parseSemesterNumber("3")).toBe(1);
  });
});

describe("resolveSemesterContext", () => {
  it("uses year and semester params when valid", () => {
    const ctx = resolveSemesterContext("y-active", "2", years, semesters);
    expect(ctx?.semesterId).toBe("s2-active");
    expect(ctx?.semesterNumber).toBe(2);
  });

  it("defaults to active year and semester 1", () => {
    const ctx = resolveSemesterContext(undefined, undefined, years, semesters);
    expect(ctx?.academicYearId).toBe("y-active");
    expect(ctx?.semesterId).toBe("s1-active");
  });
});
