import { describe, expect, it } from "vitest";
import { validateStudentForm } from "@/lib/students/validation";

describe("validateStudentForm", () => {
  it("accepts valid student input", () => {
    expect(
      validateStudentForm({
        studentCode: "67001",
        firstName: "สมชาย",
        lastName: "ใจดี",
        idCard: "",
        status: "active",
      }),
    ).toEqual({ ok: true });
  });

  it("returns field errors for missing required fields", () => {
    const result = validateStudentForm({
      studentCode: "",
      firstName: "",
      lastName: "",
      idCard: "",
      status: "active",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.studentCode).toBeTruthy();
      expect(result.errors.firstName).toBeTruthy();
      expect(result.errors.lastName).toBeTruthy();
    }
  });
});
