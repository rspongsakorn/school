import { describe, expect, it } from "vitest";
import { parseBuddhistDate } from "./csv-import";

describe("parseBuddhistDate", () => {
  it("parses DD/MM/YYYY Buddhist date to ISO CE date", () => {
    expect(parseBuddhistDate("06/05/2569")).toBe("2026-05-06");
  });
  it("accepts single-digit day and month", () => {
    expect(parseBuddhistDate("6/5/2569")).toBe("2026-05-06");
  });
  it("returns null for wrong format", () => {
    expect(parseBuddhistDate("2026-05-06")).toBeNull();
  });
  it("returns null for impossible calendar date", () => {
    expect(parseBuddhistDate("31/02/2569")).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(parseBuddhistDate("")).toBeNull();
  });
});
