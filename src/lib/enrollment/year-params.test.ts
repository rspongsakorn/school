import { describe, expect, it } from "vitest";
import { resolveSelectedYearId } from "@/lib/enrollment/year-params";

const years = [
  { id: "y-active", name: "2568", is_active: true },
  { id: "y-old", name: "2567", is_active: false },
];

describe("resolveSelectedYearId", () => {
  it("uses query param when valid", () => {
    expect(resolveSelectedYearId("y-old", years)).toBe("y-old");
  });

  it("falls back to active year", () => {
    expect(resolveSelectedYearId(undefined, years)).toBe("y-active");
  });

  it("falls back to first year when no active", () => {
    const onlyOld = [{ id: "y-old", name: "2567", is_active: false }];
    expect(resolveSelectedYearId(undefined, onlyOld)).toBe("y-old");
  });
});
