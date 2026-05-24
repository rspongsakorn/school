import { describe, expect, it } from "vitest";
import {
  formatThaiBirthDate,
  isoDateFromLocalDate,
  isFutureIsoDate,
  parseIsoDateOnly,
  toBuddhistYear,
} from "@/lib/students/dates";

describe("toBuddhistYear", () => {
  it("adds 543 to CE year", () => {
    expect(toBuddhistYear(2007)).toBe(2550);
  });
});

describe("parseIsoDateOnly / isoDateFromLocalDate", () => {
  it("round-trips without timezone shift", () => {
    const date = parseIsoDateOnly("2007-05-15");
    expect(isoDateFromLocalDate(date)).toBe("2007-05-15");
  });
});

describe("formatThaiBirthDate", () => {
  it("formats with Buddhist year", () => {
    expect(formatThaiBirthDate("2007-05-15")).toBe("15 พ.ค. 2550");
  });
});

describe("isFutureIsoDate", () => {
  it("returns true for tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isFutureIsoDate(isoDateFromLocalDate(tomorrow))).toBe(true);
  });

  it("returns false for today", () => {
    expect(isFutureIsoDate(isoDateFromLocalDate(new Date()))).toBe(false);
  });
});
