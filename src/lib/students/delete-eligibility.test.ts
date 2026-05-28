import { describe, expect, it } from "vitest";
import {
  canDeleteStudent,
  studentDeleteBlockedReason,
  studentHasBlockingReferences,
} from "@/lib/students/delete-eligibility";

describe("studentHasBlockingReferences", () => {
  it("blocks delete when student is currently enrolled", () => {
    expect(
      studentHasBlockingReferences({
        activeEnrollments: 1,
        invoices: 0,
        activePayments: 0,
      }),
    ).toBe(true);
  });

  it("blocks delete when active payment exists", () => {
    expect(
      studentHasBlockingReferences({
        activeEnrollments: 0,
        invoices: 0,
        activePayments: 1,
      }),
    ).toBe(true);
  });

  it("allows delete when only invoices exist (no active enrollment or payment)", () => {
    expect(
      studentHasBlockingReferences({
        activeEnrollments: 0,
        invoices: 2,
        activePayments: 0,
      }),
    ).toBe(false);
  });

  it("allows delete when only voided payment history + invoices exist (no enrollment)", () => {
    expect(
      studentHasBlockingReferences({
        activeEnrollments: 0,
        invoices: 1,
        activePayments: 0,
      }),
    ).toBe(false);
  });

  it("allows delete when all reference counts are zero or null", () => {
    expect(
      studentHasBlockingReferences({
        activeEnrollments: 0,
        invoices: 0,
        activePayments: 0,
      }),
    ).toBe(false);
    expect(
      studentHasBlockingReferences({
        activeEnrollments: null,
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

  it("blocks delete with blocking references and mentions enrollment or receipt", () => {
    expect(canDeleteStudent(true)).toBe(false);
    const msg = studentDeleteBlockedReason(true);
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/ลงทะเบียน|ใบเสร็จ/);
  });
});
