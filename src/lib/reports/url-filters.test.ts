import { describe, it, expect } from "vitest";
import {
  mergeQuery,
  parseDateParam,
  parseEnumParam,
  rosterHref,
  statementHref,
} from "./url-filters";

describe("mergeQuery", () => {
  it("keeps params it was not asked about, such as year and semester", () => {
    expect(mergeQuery("year=y1&semester=1", { q: "14297" }, { q: "" })).toBe(
      "year=y1&semester=1&q=14297",
    );
  });

  it("drops a filter that is back at its default", () => {
    expect(mergeQuery("year=y1&level=all", { level: "grade" }, { level: "grade" })).toBe("year=y1");
  });

  it("drops a filter that is empty or undefined", () => {
    expect(mergeQuery("q=abc&grade=g1", { q: "", grade: undefined }, {})).toBe("");
  });

  it("overwrites a changed filter", () => {
    expect(mergeQuery("from=2026-11-01", { from: "2026-09-01" }, { from: "2026-11-01" })).toBe(
      "from=2026-09-01",
    );
  });

  it("accepts a leading question mark", () => {
    expect(mergeQuery("?year=y1", { doc: "receipts" }, { doc: "summary" })).toBe(
      "year=y1&doc=receipts",
    );
  });
});

describe("parseDateParam", () => {
  it("accepts a real calendar date", () => {
    expect(parseDateParam("2026-09-01", "2026-11-01")).toBe("2026-09-01");
  });

  it("falls back on anything that is not a real date", () => {
    for (const bad of ["2026-13-40", "2026-02-30", "abc", "2026-9-1", ""]) {
      expect(parseDateParam(bad, "2026-11-01")).toBe("2026-11-01");
    }
    expect(parseDateParam(null, "2026-11-01")).toBe("2026-11-01");
  });
});

describe("parseEnumParam", () => {
  const DOCS = ["summary", "receipts", "remittance", "by-user"] as const;

  it("keeps an allowed value", () => {
    expect(parseEnumParam("remittance", DOCS, "summary")).toBe("remittance");
  });

  it("falls back on an unknown or missing value", () => {
    expect(parseEnumParam("bogus", DOCS, "summary")).toBe("summary");
    expect(parseEnumParam(null, DOCS, "summary")).toBe("summary");
  });
});

describe("statement and roster links", () => {
  it("carries the roster's filters to the statement and back", () => {
    expect(statementHref("stu-1", "q=14297&status=outstanding")).toBe(
      "/reports/students/stu-1?q=14297&status=outstanding",
    );
    expect(rosterHref("q=14297&status=outstanding&year=y1&semester=2")).toBe(
      "/reports/students?q=14297&status=outstanding&year=y1&semester=2",
    );
  });

  it("leaves no dangling question mark when there are no filters", () => {
    expect(statementHref("stu-1", "")).toBe("/reports/students/stu-1");
    expect(rosterHref("?")).toBe("/reports/students");
  });
});
