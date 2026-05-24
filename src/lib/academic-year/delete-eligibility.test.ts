import { describe, expect, it } from "vitest";
import {
  semesterDeleteBlockedMessage,
  semesterHasBlockingReferences,
  yearDeleteBlockedMessage,
  yearHasBlockingReferences,
  type SemesterReferenceCounts,
} from "@/lib/academic-year/delete-eligibility";

describe("semesterHasBlockingReferences", () => {
  const empty: SemesterReferenceCounts = {
    gradeLevels: 0,
    classrooms: 0,
    enrollments: 0,
    teacherAssignments: 0,
    feeRates: 0,
    invoices: 0,
  };

  it("blocks when any count > 0", () => {
    expect(semesterHasBlockingReferences({ ...empty, gradeLevels: 1 })).toBe(true);
    expect(semesterHasBlockingReferences(empty)).toBe(false);
  });
});

describe("yearHasBlockingReferences", () => {
  it("blocks when active", () => {
    expect(
      yearHasBlockingReferences({
        isActive: true,
        gradeLevels: 0,
        classrooms: 0,
        enrollments: 0,
        teacherAssignments: 0,
        feeRates: 0,
        invoices: 0,
        payments: 0,
      }),
    ).toBe(true);
  });

  it("blocks when payments exist", () => {
    expect(
      yearHasBlockingReferences({
        isActive: false,
        gradeLevels: 0,
        classrooms: 0,
        enrollments: 0,
        teacherAssignments: 0,
        feeRates: 0,
        invoices: 0,
        payments: 1,
      }),
    ).toBe(true);
  });
});

describe("messages", () => {
  it("returns Thai semester message", () => {
    expect(semesterDeleteBlockedMessage()).toContain("ภาคเรียน");
  });

  it("returns Thai active year message", () => {
    expect(yearDeleteBlockedMessage("year_is_active")).toContain("ใช้งาน");
  });
});
