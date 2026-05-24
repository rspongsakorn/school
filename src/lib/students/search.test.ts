import { describe, expect, it } from "vitest";
import { buildStudentSearchOrFilter, escapeIlikePattern } from "@/lib/students/search";

describe("escapeIlikePattern", () => {
  it("escapes ilike wildcards", () => {
    expect(escapeIlikePattern("100%")).toBe("100\\%");
    expect(escapeIlikePattern("a_b")).toBe("a\\_b");
  });

  it("removes PostgREST filter syntax characters", () => {
    expect(escapeIlikePattern("a,b")).toBe("ab");
    expect(escapeIlikePattern("x(y)z")).toBe("xyz");
  });
});

describe("buildStudentSearchOrFilter", () => {
  it("builds a safe or filter for three columns", () => {
    expect(buildStudentSearchOrFilter("som")).toBe(
      "student_code.ilike.%som%,first_name.ilike.%som%,last_name.ilike.%som%",
    );
  });

  it("returns empty string for blank input", () => {
    expect(buildStudentSearchOrFilter("   ")).toBe("");
  });
});
