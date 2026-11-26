import { describe, it, expect } from "vitest";
import {
  OUTSTANDING_STATUS_ITEMS,
  outstandingStatusQuery,
  parseOutstandingStatus,
} from "./outstanding-status";

describe("parseOutstandingStatus", () => {
  it("defaults to outstanding when the param is missing", () => {
    expect(parseOutstandingStatus(null)).toBe("outstanding");
  });

  it("keeps old single-status bookmarks", () => {
    expect(parseOutstandingStatus("unpaid")).toBe("unpaid");
    expect(parseOutstandingStatus("partial")).toBe("partial");
    expect(parseOutstandingStatus("paid")).toBe("paid");
  });

  it("reads all explicitly", () => {
    expect(parseOutstandingStatus("all")).toBe("all");
  });

  it("falls back to outstanding on an unknown value", () => {
    expect(parseOutstandingStatus("bogus")).toBe("outstanding");
  });
});

describe("outstandingStatusQuery", () => {
  it("maps each filter to the query's arguments", () => {
    expect(outstandingStatusQuery("outstanding")).toEqual({ status: "all", includeAllStatuses: false });
    expect(outstandingStatusQuery("all")).toEqual({ status: "all", includeAllStatuses: true });
    expect(outstandingStatusQuery("unpaid")).toEqual({ status: "unpaid", includeAllStatuses: true });
    expect(outstandingStatusQuery("partial")).toEqual({ status: "partial", includeAllStatuses: true });
    expect(outstandingStatusQuery("paid")).toEqual({ status: "paid", includeAllStatuses: true });
  });
});

describe("OUTSTANDING_STATUS_ITEMS", () => {
  it("lists the options in the agreed order and wording", () => {
    expect(OUTSTANDING_STATUS_ITEMS.map((i) => i.value)).toEqual([
      "outstanding",
      "unpaid",
      "partial",
      "paid",
      "all",
    ]);
    expect(OUTSTANDING_STATUS_ITEMS.map((i) => i.label)).toEqual([
      "ยังค้างชำระ",
      "ยังไม่ชำระ",
      "ชำระบางส่วน",
      "ชำระแล้ว",
      "ทุกสถานะ",
    ]);
  });
});
