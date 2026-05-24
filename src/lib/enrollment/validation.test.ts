import { describe, expect, it } from "vitest";
import {
  isValidEnrollmentStatus,
  validateClassroomName,
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

describe("validateClassroomName", () => {
  it("rejects empty name", () => {
    expect(validateClassroomName("")).toEqual({ ok: false, error: "กรุณากรอกชื่อห้องเรียน" });
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
