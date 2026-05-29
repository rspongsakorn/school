import { describe, expect, it } from "vitest";
import { bangkokDateKey } from "./date";

describe("bangkokDateKey", () => {
  it("returns YYYY-MM-DD for a daytime Bangkok instant", () => {
    expect(bangkokDateKey("2026-05-28T05:00:00Z")).toBe("2026-05-28");
  });

  it("rolls a late-UTC time into the next Bangkok day", () => {
    expect(bangkokDateKey("2026-05-28T18:30:00Z")).toBe("2026-05-29");
  });

  it("keeps a late-evening Bangkok time on the same day", () => {
    expect(bangkokDateKey("2026-05-28T16:00:00Z")).toBe("2026-05-28");
  });

  it("accepts a Date object", () => {
    expect(bangkokDateKey(new Date("2026-05-28T05:00:00Z"))).toBe("2026-05-28");
  });

  it("rolls over exactly at 17:00 UTC (Bangkok midnight)", () => {
    expect(bangkokDateKey("2026-05-28T17:00:00Z")).toBe("2026-05-29");
  });

  it("stays on the same day one second before Bangkok midnight", () => {
    expect(bangkokDateKey("2026-05-28T16:59:59Z")).toBe("2026-05-28");
  });
});
