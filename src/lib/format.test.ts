import { describe, expect, it } from "vitest";
import {
  formatThaiDate,
  formatThaiDateLong,
  formatThaiTime,
  compareGradeLevelNames,
  compareGradeLevels,
  gradeLevelSortKey,
} from "./format";

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

describe("compareGradeLevelNames", () => {
  it("orders by school level, not Thai alphabetical order (ป. sorts before ตอ./อ. alphabetically)", () => {
    expect(["ป.1", "อ.1"].sort(compareGradeLevelNames)).toEqual(["อ.1", "ป.1"]);
  });

  it("puts ตอ. (nursery) ahead of อ. (kindergarten)", () => {
    expect(["อ.1", "ตอ.1"].sort(compareGradeLevelNames)).toEqual(["ตอ.1", "อ.1"]);
  });

  it("orders every level low to high", () => {
    const shuffled = ["ปวส.1", "ม.1", "อ.2", "ปวช.1", "ป.6", "ตอ.1"];
    expect(shuffled.sort(compareGradeLevelNames)).toEqual([
      "ตอ.1",
      "อ.2",
      "ป.6",
      "ม.1",
      "ปวช.1",
      "ปวส.1",
    ]);
  });

  it("orders numbers within the same level numerically, not alphabetically", () => {
    expect(["ป.10", "ป.2"].sort(compareGradeLevelNames)).toEqual(["ป.2", "ป.10"]);
  });

  it("puts unrecognized prefixes after known levels", () => {
    expect(["พิเศษ", "ป.1"].sort(compareGradeLevelNames)).toEqual(["ป.1", "พิเศษ"]);
  });
});

describe("compareGradeLevels", () => {
  const g = (name: string, sort_order = 0) => ({ name, sort_order });

  it("falls back to school-level order when every sort_order is the default 0", () => {
    const shuffled = [g("ม.3"), g("ป.1"), g("ตอ."), g("อ.2"), g("ม.1")];
    expect(shuffled.sort(compareGradeLevels).map((x) => x.name)).toEqual([
      "ตอ.",
      "อ.2",
      "ป.1",
      "ม.1",
      "ม.3",
    ]);
  });

  it("honours an explicitly configured sort_order over the name", () => {
    const rows = [g("ตอ.", 2), g("ม.1", 1)];
    expect(rows.sort(compareGradeLevels).map((x) => x.name)).toEqual(["ม.1", "ตอ."]);
  });
});

describe("gradeLevelSortKey", () => {
  it("sorts numerically in the same order as compareGradeLevels", () => {
    const names = ["ม.3", "ป.1", "ตอ.", "อ.2", "ป.10"];
    const sorted = [...names].sort((a, b) => gradeLevelSortKey(a) - gradeLevelSortKey(b));
    expect(sorted).toEqual(["ตอ.", "อ.2", "ป.1", "ป.10", "ม.3"]);
  });

  it("lets a configured sort_order outrank the name", () => {
    expect(gradeLevelSortKey("ม.1", 1)).toBeGreaterThan(gradeLevelSortKey("ตอ.", 0));
    expect(gradeLevelSortKey("ตอ.", 1)).toBeGreaterThan(gradeLevelSortKey("ม.1", 0));
  });
});

describe("compareGradeLevelNames on room labels", () => {
  it("orders grade/room labels by school level, keeping อ. above ป.", () => {
    const rooms = ["ป.1/1", "ม.1/2", "อ.2/1", "ตอ./1", "ป.1/3", "ป.10/1"];
    expect(rooms.sort(compareGradeLevelNames)).toEqual([
      "ตอ./1",
      "อ.2/1",
      "ป.1/1",
      "ป.1/3",
      "ป.10/1",
      "ม.1/2",
    ]);
  });
});
