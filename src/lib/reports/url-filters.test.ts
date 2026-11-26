import { describe, it, expect } from "vitest";
import {
  isCommittableDate,
  knownOr,
  mergeQuery,
  outstandingByRoomQuery,
  parseDateParam,
  parseEnumParam,
  pickQuery,
  rosterHref,
  rosterQueryFromOutstanding,
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

describe("knownOr", () => {
  it("falls back to all for an id the loaded list does not have", () => {
    expect(knownOr("old-term-grade", ["g1", "g2"], true)).toBe("all");
  });

  it("keeps a known id, and keeps anything while the list is still loading", () => {
    expect(knownOr("g1", ["g1", "g2"], true)).toBe("g1");
    expect(knownOr("g9", [], false)).toBe("g9");
    expect(knownOr("all", ["g1"], true)).toBe("all");
  });
});

describe("isCommittableDate", () => {
  it("accepts a plausible complete date", () => {
    expect(isCommittableDate("2026-09-01")).toBe(true);
  });

  it("rejects the in-between values a browser reports while a year is typed", () => {
    for (const partial of ["0002-09-01", "0020-09-01", "0202-09-01", "", "2026-02-30"]) {
      expect(isCommittableDate(partial)).toBe(false);
    }
  });
});

describe("pickQuery", () => {
  it("keeps only the named params, in the order they appear", () => {
    expect(pickQuery("year=y1&grade=g1&variant=free&semester=2", ["year", "semester", "grade"])).toBe(
      "year=y1&grade=g1&semester=2",
    );
  });

  it("returns an empty string when none are present", () => {
    expect(pickQuery("variant=free", ["year"])).toBe("");
  });
});

describe("rosterQueryFromOutstanding", () => {
  it("carries term, grade and room, and drops what the roster has no field for", () => {
    expect(
      rosterQueryFromOutstanding("year=y1&semester=1&grade=g1&classroom=c1&variant=free&invoiceType=t1&view=perStudent"),
    ).toBe("year=y1&semester=1&grade=g1&classroom=c1&status=outstanding");
  });

  it("maps the outstanding report's default (no status) to the roster's still-owed filter", () => {
    expect(rosterQueryFromOutstanding("")).toBe("status=outstanding");
  });

  it("maps all statuses to no status filter", () => {
    expect(rosterQueryFromOutstanding("status=all&year=y1")).toBe("year=y1");
  });

  it("keeps a single status as it is", () => {
    expect(rosterQueryFromOutstanding("status=paid")).toBe("status=paid");
    expect(rosterQueryFromOutstanding("status=partial")).toBe("status=partial");
  });

  it("reads an unknown status as the default", () => {
    expect(rosterQueryFromOutstanding("status=bogus")).toBe("status=outstanding");
  });
});

describe("outstandingByRoomQuery", () => {
  it("opens the by-room view with the term, grade and room carried over", () => {
    expect(outstandingByRoomQuery("year=y1&semester=1&grade=g1&classroom=c1&form=unpaid")).toBe(
      "view=byRoom&year=y1&semester=1&grade=g1&classroom=c1",
    );
  });

  it("is just the view when nothing carries over", () => {
    expect(outstandingByRoomQuery("")).toBe("view=byRoom");
  });
});
