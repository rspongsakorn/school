import { describe, expect, it } from "vitest";
import { formatThaiDateLong } from "./format";

describe("formatThaiDateLong", () => {
  it("returns the day number", () => {
    const result = formatThaiDateLong("2026-05-28T12:00:00.000Z");
    expect(result).toContain("28");
  });

  it("returns Thai month name", () => {
    const result = formatThaiDateLong("2026-05-28T12:00:00.000Z");
    expect(result).toContain("พฤษภาคม");
  });

  it("returns Buddhist Era year (CE + 543)", () => {
    // 2026 CE = 2569 BE
    const result = formatThaiDateLong("2026-05-28T12:00:00.000Z");
    expect(result).toContain("2569");
  });

  it("accepts a Date object", () => {
    const result = formatThaiDateLong(new Date("2026-01-01T12:00:00.000Z"));
    expect(result).toContain("มกราคม");
  });

  it("uses Bangkok timezone — 23:00 UTC on May 28 is May 29 in Bangkok", () => {
    // 2026-05-28T23:00:00Z = 2026-05-29T06:00:00+07:00 (Bangkok)
    const result = formatThaiDateLong("2026-05-28T23:00:00.000Z");
    expect(result).toContain("29");
    expect(result).toContain("พฤษภาคม");
  });
});
