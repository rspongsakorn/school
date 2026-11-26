import { describe, it, expect } from "vitest";
import { teacherMayVisit } from "./teacher-routes";

describe("teacherMayVisit", () => {
  it("allows every report the teacher's menu offers", () => {
    for (const path of [
      "/reports",
      "/reports/outstanding",
      "/reports/collections",
      "/reports/students",
    ]) {
      expect(teacherMayVisit(path)).toBe(true);
    }
  });

  it("allows one student's statement", () => {
    expect(teacherMayVisit("/reports/students/a815f217-a7bb-459c-976e-b3077d597133")).toBe(true);
  });

  it("refuses the finance-only reports (the debtors report sums every year, which a teacher's row-level view cannot supply) and everything outside reports", () => {
    for (const path of ["/reports/daily", "/reports/discounts", "/reports/debtors", "/", "/students", "/invoices", "/accounting"]) {
      expect(teacherMayVisit(path)).toBe(false);
    }
  });

  it("does not match a path that only starts like an allowed one", () => {
    for (const path of ["/reports/students-x", "/reports/outstandingfoo", "/reports/debtors/extra", "/reportsx"]) {
      expect(teacherMayVisit(path)).toBe(false);
    }
  });
});
