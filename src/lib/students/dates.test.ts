import { describe, expect, it } from "vitest";
import {
  buildBirthDateIso,
  daysInMonth,
  formatMonthDropdownThai,
  formatThaiBirthDate,
  formatThaiBirthdateShort,
  formatYearDropdownBE,
  isoDateFromLocalDate,
  isFutureIsoDate,
  parseBirthDateParts,
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

describe("formatThaiBirthdateShort", () => {
  it("formats ISO as Thai short date for CSV re-validation", () => {
    expect(formatThaiBirthdateShort("2012-04-21")).toBe("21 เม.ย. 55");
  });
});

describe("buildBirthDateIso", () => {
  it("combines year month day", () => {
    expect(
      buildBirthDateIso({ year: "2007", month: "5", day: "15" }),
    ).toBe("2007-05-15");
  });

  it("returns empty when incomplete", () => {
    expect(buildBirthDateIso({ year: "2007", month: "5", day: "" })).toBe("");
  });

  it("clamps day to last day of month", () => {
    expect(
      buildBirthDateIso({ year: "2007", month: "2", day: "31" }),
    ).toBe("2007-02-28");
  });
});

describe("parseBirthDateParts", () => {
  it("parses iso date", () => {
    expect(parseBirthDateParts("2007-05-15")).toEqual({
      year: 2007,
      month: 5,
      day: 15,
    });
  });
});

describe("daysInMonth", () => {
  it("returns 29 for Feb 2008", () => {
    expect(daysInMonth(2008, 2)).toBe(29);
  });
});

describe("dropdown formatters", () => {
  it("formats year dropdown as BE", () => {
    expect(formatYearDropdownBE(new Date(2007, 4, 1))).toBe("2550");
  });

  it("formats month dropdown in Thai", () => {
    expect(formatMonthDropdownThai(new Date(2007, 4, 1))).toBe("พฤษภาคม");
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
