import { describe, expect, it } from "vitest";
import { mapClassroomsByName, mapGradesByOrder } from "./mapping";

const g = (id: string, name: string, sortOrder: number) => ({ id, name, sortOrder });
const c = (id: string, name: string) => ({ id, name });

describe("mapGradesByOrder", () => {
  it("maps each grade to the next one by sort order, last graduates", () => {
    const source = [g("s1", "ป.1", 1), g("s2", "ป.2", 2), g("s3", "ป.3", 3)];
    const target = [g("t1", "ป.1", 1), g("t2", "ป.2", 2), g("t3", "ป.3", 3)];
    expect(mapGradesByOrder(source, target)).toEqual([
      { sourceGradeId: "s1", targetGradeId: "t2" },
      { sourceGradeId: "s2", targetGradeId: "t3" },
      { sourceGradeId: "s3", targetGradeId: null },
    ]);
  });

  it("sorts inputs by sortOrder before mapping", () => {
    const source = [g("s2", "ป.2", 2), g("s1", "ป.1", 1)];
    const target = [g("t2", "ป.2", 2), g("t1", "ป.1", 1)];
    expect(mapGradesByOrder(source, target)).toEqual([
      { sourceGradeId: "s1", targetGradeId: "t2" },
      { sourceGradeId: "s2", targetGradeId: null },
    ]);
  });

  it("maps to null when target has fewer grades", () => {
    const source = [g("s1", "ป.1", 1), g("s2", "ป.2", 2)];
    const target = [g("t1", "ป.1", 1)];
    expect(mapGradesByOrder(source, target)).toEqual([
      { sourceGradeId: "s1", targetGradeId: null },
      { sourceGradeId: "s2", targetGradeId: null },
    ]);
  });

  it("returns empty for empty source", () => {
    expect(mapGradesByOrder([], [g("t1", "ป.1", 1)])).toEqual([]);
  });
});

describe("mapClassroomsByName", () => {
  it("matches classrooms by exact name", () => {
    const source = [c("s1", "1"), c("s2", "2")];
    const target = [c("t1", "1"), c("t2", "2")];
    expect(mapClassroomsByName(source, target)).toEqual([
      { sourceClassroomId: "s1", targetClassroomId: "t1" },
      { sourceClassroomId: "s2", targetClassroomId: "t2" },
    ]);
  });

  it("trims whitespace before comparing", () => {
    const source = [c("s1", " 1 ")];
    const target = [c("t1", "1")];
    expect(mapClassroomsByName(source, target)).toEqual([
      { sourceClassroomId: "s1", targetClassroomId: "t1" },
    ]);
  });

  it("returns null when no name matches", () => {
    const source = [c("s1", "1")];
    const target = [c("t1", "2")];
    expect(mapClassroomsByName(source, target)).toEqual([
      { sourceClassroomId: "s1", targetClassroomId: null },
    ]);
  });

  it("returns null target when target list is empty", () => {
    const source = [c("s1", "1")];
    expect(mapClassroomsByName(source, [])).toEqual([
      { sourceClassroomId: "s1", targetClassroomId: null },
    ]);
  });
});
