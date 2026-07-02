import { describe, expect, it } from "vitest";
import { formatThaiDate, formatThaiDateLong, formatThaiTime } from "./format";

describe("formatThaiDate", () => {
  it("uses Bangkok timezone — 23:00 UTC on May 28 is May 29 in Bangkok", () => {
    // 2026-05-28T23:00:00Z = 2026-05-29T06:00:00+07:00 (Bangkok)
    const result = formatThaiDate("2026-05-28T23:00:00.000Z");
    expect(result).toContain("29");
  });
});

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

describe("formatThaiTime", () => {
  it("formats an instant as 24-hour HH:MM in Bangkok time", () => {
    // 2026-05-28T05:00:00Z = 12:00 Bangkok
    expect(formatThaiTime("2026-05-28T05:00:00Z")).toBe("12:00");
  });

  it("uses 24-hour clock (not AM/PM) for after-midnight Bangkok time", () => {
    // 2026-05-28T18:30:00Z = 01:30 Bangkok next day
    expect(formatThaiTime("2026-05-28T18:30:00Z")).toBe("01:30");
  });

  it("accepts a Date object", () => {
    expect(formatThaiTime(new Date("2026-05-28T05:00:00Z"))).toBe("12:00");
  });
});
