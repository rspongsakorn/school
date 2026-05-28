import { describe, expect, it } from "vitest";
import {
  canDeleteStudent,
  studentDeleteBlockedReason,
  studentHasBlockingReferences,
} from "@/lib/students/delete-eligibility";

describe("studentHasBlockingReferences", () => {
  it("blocks delete only when active payments exist", () => {
    expect(
      studentHasBlockingReferences({ enrollments: 0, invoices: 0, activePayments: 1 }),
    ).toBe(true);
  });

  it("allows delete when only enrollments exist (will be cascade-cleaned)", () => {
    expect(
      studentHasBlockingReferences({ enrollments: 3, invoices: 0, activePayments: 0 }),
    ).toBe(false);
  });

  it("allows delete when only invoices exist without active payments", () => {
    expect(
      studentHasBlockingReferences({ enrollments: 0, invoices: 2, activePayments: 0 }),
    ).toBe(false);
  });

  it("allows delete when only voided payment history + invoices + enrollments exist", () => {
    expect(
      studentHasBlockingReferences({ enrollments: 1, invoices: 1, activePayments: 0 }),
    ).toBe(false);
  });

  it("allows delete when all reference counts are zero or null", () => {
    expect(
      studentHasBlockingReferences({ enrollments: 0, invoices: 0, activePayments: 0 }),
    ).toBe(false);
    expect(
      studentHasBlockingReferences({
        enrollments: null,
        invoices: null,
        activePayments: null,
      }),
    ).toBe(false);
  });
});

describe("canDeleteStudent", () => {
  it("allows delete without blocking references", () => {
    expect(canDeleteStudent(false)).toBe(true);
    expect(studentDeleteBlockedReason(false)).toBeNull();
  });

  it("blocks delete with blocking references and mentions receipt void", () => {
    expect(canDeleteStudent(true)).toBe(false);
    expect(studentDeleteBlockedReason(true)).toContain("ใบเสร็จ");
  });
});
