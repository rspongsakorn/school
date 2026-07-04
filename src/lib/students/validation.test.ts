import { describe, expect, it } from "vitest";
import { validateStudentForm } from "@/lib/students/validation";

const base = {
  studentCode: "67001",
  firstName: "สมชาย",
  lastName: "ใจดี",
  idCard: "",
  status: "active" as const,
  gender: "" as const,
  dateOfBirth: "",
};

describe("validateStudentForm", () => {
  it("accepts valid student input on create", () => {
    expect(
      validateStudentForm(
        { ...base, gender: "male", dateOfBirth: "2007-05-15" },
        { mode: "create" },
      ),
    ).toEqual({ ok: true });
  });

  it("returns field errors for missing required fields", () => {
    const result = validateStudentForm(
      {
        studentCode: "",
        firstName: "",
        lastName: "",
        idCard: "",
        status: "active",
        gender: "",
        dateOfBirth: "",
      },
      { mode: "create" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.studentCode).toBeTruthy();
      expect(result.errors.firstName).toBeTruthy();
      expect(result.errors.lastName).toBeTruthy();
      expect(result.errors.gender).toBeTruthy();
      expect(result.errors.dateOfBirth).toBeTruthy();
    }
  });
});

describe("validateStudentForm gender and birth date", () => {
  it("requires gender and dateOfBirth on create", () => {
    const result = validateStudentForm(
      { ...base, gender: "", dateOfBirth: "" },
      { mode: "create" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.gender).toBe("กรุณาเลือกเพศ");
      expect(result.errors.dateOfBirth).toBe("กรุณาเลือกวันเกิด");
    }
  });

  it("allows empty gender and dateOfBirth on update for legacy row", () => {
    expect(
      validateStudentForm(
        { ...base, gender: "", dateOfBirth: "" },
        {
          mode: "update",
          existing: { gender: null, dateOfBirth: null },
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects clearing gender on update when previously set", () => {
    const result = validateStudentForm(
      { ...base, gender: "", dateOfBirth: "2007-05-15" },
      {
        mode: "update",
        existing: { gender: "male", dateOfBirth: "2007-05-15" },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.gender).toBe("กรุณาเลือกเพศ");
  });

  it("rejects future birth date", () => {
    const result = validateStudentForm(
      { ...base, gender: "male", dateOfBirth: "2099-01-01" },
      { mode: "create" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.dateOfBirth).toBe("วันเกิดต้องไม่เป็นวันในอนาคต");
    }
  });
});
