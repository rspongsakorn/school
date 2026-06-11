import { describe, expect, it } from "vitest";
import { buildCarryForwardEnrollments } from "./carry-forward";

describe("buildCarryForwardEnrollments", () => {
  const base = {
    targetSemesterId: "sem2",
    targetAcademicYearId: "year1",
  };

  it("maps each source enrollment to the matching target classroom", () => {
    const rows = buildCarryForwardEnrollments({
      ...base,
      sourceEnrollments: [
        { student_id: "s1", classroom_id: "srcA" },
        { student_id: "s2", classroom_id: "srcB" },
      ],
      targetClassroomBySource: new Map([
        ["srcA", "dstA"],
        ["srcB", "dstB"],
      ]),
    });

    expect(rows).toEqual([
      {
        student_id: "s1",
        classroom_id: "dstA",
        academic_year_id: "year1",
        semester_id: "sem2",
        status: "enrolled",
      },
      {
        student_id: "s2",
        classroom_id: "dstB",
        academic_year_id: "year1",
        semester_id: "sem2",
        status: "enrolled",
      },
    ]);
  });

  it("skips enrollments whose source classroom has no target mapping", () => {
    const rows = buildCarryForwardEnrollments({
      ...base,
      sourceEnrollments: [
        { student_id: "s1", classroom_id: "srcA" },
        { student_id: "s2", classroom_id: "orphan" },
      ],
      targetClassroomBySource: new Map([["srcA", "dstA"]]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ student_id: "s1", classroom_id: "dstA" });
  });

  it("returns an empty array when there are no source enrollments", () => {
    const rows = buildCarryForwardEnrollments({
      ...base,
      sourceEnrollments: [],
      targetClassroomBySource: new Map([["srcA", "dstA"]]),
    });
    expect(rows).toEqual([]);
  });
});
