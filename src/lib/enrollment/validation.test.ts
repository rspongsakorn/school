import { describe, expect, it } from "vitest";
import {
  isValidEnrollmentStatus,
  validateClassroomNumber,
  validateGradeLevelName,
} from "@/lib/enrollment/validation";

describe("validateGradeLevelName", () => {
  it("rejects empty name", () => {
    expect(validateGradeLevelName("  ")).toEqual({ ok: false, error: "กรุณากรอกชื่อชั้นเรียน" });
  });

  it("accepts non-empty name", () => {
    expect(validateGradeLevelName("ป.1")).toEqual({ ok: true });
  });
});

describe("validateClassroomNumber", () => {
  it("rejects empty string", () => {
    expect(validateClassroomNumber("")).toEqual({ ok: false, error: "กรุณากรอกหมายเลขห้อง" });
  });

  it("rejects non-numeric strings", () => {
    expect(validateClassroomNumber("abc")).toEqual({ ok: false, error: "หมายเลขห้องต้องเป็นตัวเลขเท่านั้น" });
  });

  it("rejects numbers outside 1–999", () => {
    expect(validateClassroomNumber("0")).toEqual({ ok: false, error: "หมายเลขห้องต้องอยู่ระหว่าง 1–999" });
    expect(validateClassroomNumber("1000")).toEqual({ ok: false, error: "หมายเลขห้องต้องอยู่ระหว่าง 1–999" });
  });

  it("accepts valid numbers", () => {
    expect(validateClassroomNumber("1")).toEqual({ ok: true });
    expect(validateClassroomNumber("42")).toEqual({ ok: true });
    expect(validateClassroomNumber("999")).toEqual({ ok: true });
  });
});

describe("isValidEnrollmentStatus", () => {
  it("allows enrolled transferred withdrawn", () => {
    expect(isValidEnrollmentStatus("enrolled")).toBe(true);
    expect(isValidEnrollmentStatus("transferred")).toBe(true);
    expect(isValidEnrollmentStatus("withdrawn")).toBe(true);
  });

  it("rejects other values", () => {
    expect(isValidEnrollmentStatus("active")).toBe(false);
  });
});
