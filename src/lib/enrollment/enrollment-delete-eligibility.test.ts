import { describe, expect, it } from "vitest";
import {
  canDeleteEnrollment,
  enrollmentDeleteBlockedReason,
} from "@/lib/enrollment/enrollment-delete-eligibility";

describe("canDeleteEnrollment", () => {
  it("allows delete when enrolled and no invoice", () => {
    expect(
      canDeleteEnrollment({ status: "enrolled", hasInvoiceInSemester: false }),
    ).toBe(true);
  });

  it("blocks delete when invoice exists", () => {
    expect(
      canDeleteEnrollment({ status: "enrolled", hasInvoiceInSemester: true }),
    ).toBe(false);
  });

  it("blocks delete when not enrolled", () => {
    expect(
      canDeleteEnrollment({ status: "withdrawn", hasInvoiceInSemester: false }),
    ).toBe(false);
  });
});

describe("enrollmentDeleteBlockedReason", () => {
  it("returns invoice message when blocked by invoice", () => {
    expect(
      enrollmentDeleteBlockedReason({ status: "enrolled", hasInvoiceInSemester: true }),
    ).toContain("ใบแจ้งชำระ");
  });
});
