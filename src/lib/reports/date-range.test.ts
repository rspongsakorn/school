import { describe, it, expect } from "vitest";
import { formatThaiRange, presetRange } from "./date-range";

describe("presetRange", () => {
  it("today is a one-day range", () => {
    expect(presetRange("today", "2026-11-26")).toEqual({ from: "2026-11-26", to: "2026-11-26" });
  });

  it("month runs from the first of the month to today", () => {
    expect(presetRange("month", "2026-11-26")).toEqual({ from: "2026-11-01", to: "2026-11-26" });
  });

  it("semester uses the semester's own dates", () => {
    expect(
      presetRange("semester", "2026-11-26", { start: "2026-05-16", end: "2026-10-10" }),
    ).toEqual({ from: "2026-05-16", to: "2026-10-10" });
  });

  it("semester without both dates has no range", () => {
    expect(presetRange("semester", "2026-11-26", { start: null, end: "2026-10-10" })).toBeNull();
    expect(presetRange("semester", "2026-11-26")).toBeNull();
  });
});

describe("formatThaiRange", () => {
  it("shows one Thai date when the range is a single day", () => {
    expect(formatThaiRange("2026-09-09", "2026-09-09")).toBe("9 ก.ย. 2569");
  });

  it("shows both ends in Thai, Buddhist year", () => {
    expect(formatThaiRange("2026-09-01", "2026-11-26")).toBe("1 ก.ย. 2569 – 26 พ.ย. 2569");
  });
});
