import { describe, expect, it } from "vitest";
import { studentHasBlockingReferences } from "@/lib/students/delete-eligibility";

describe("studentHasBlockingReferences", () => {
  it("blocks delete when any reference count is positive", () => {
    expect(
      studentHasBlockingReferences({ enrollments: 1, invoices: 0, payments: 0 }),
    ).toBe(true);
    expect(
      studentHasBlockingReferences({ enrollments: 0, invoices: 2, payments: 0 }),
    ).toBe(true);
    expect(
      studentHasBlockingReferences({ enrollments: 0, invoices: 0, payments: 1 }),
    ).toBe(true);
  });

  it("allows delete when all reference counts are zero", () => {
    expect(
      studentHasBlockingReferences({ enrollments: 0, invoices: 0, payments: 0 }),
    ).toBe(false);
    expect(
      studentHasBlockingReferences({ enrollments: null, invoices: null, payments: null }),
    ).toBe(false);
  });
});
