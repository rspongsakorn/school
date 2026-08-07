import { describe, expect, it } from "vitest";
import { fetchAllPages } from "@/lib/supabase/paginate";

/**
 * Stands in for PostgREST: serves rows from `all`, but never returns more than
 * `serverCap` rows in one response no matter how wide a range is requested —
 * which is exactly what Supabase's max-rows setting does.
 */
function fakeTable(all: number[], serverCap: number) {
  const calls: [number, number][] = [];
  return {
    calls,
    fetchPage: async (from: number, to: number) => {
      calls.push([from, to]);
      const requested = all.slice(from, to + 1);
      return { data: requested.slice(0, serverCap), error: null };
    },
  };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("fetchAllPages", () => {
  it("returns every row when the table fits in one page", async () => {
    const table = fakeTable(rows(3), 1000);
    expect(await fetchAllPages(table.fetchPage, 1000)).toEqual([0, 1, 2]);
  });

  it("returns an empty list for an empty table", async () => {
    const table = fakeTable([], 1000);
    expect(await fetchAllPages(table.fetchPage, 1000)).toEqual([]);
  });

  it("pages through a table larger than one page", async () => {
    const table = fakeTable(rows(2500), 1000);
    const result = await fetchAllPages(table.fetchPage, 1000);
    expect(result).toHaveLength(2500);
    expect(result).toEqual(rows(2500));
  });

  it("returns every row when the table is an exact multiple of the page size", async () => {
    const table = fakeTable(rows(2000), 1000);
    expect(await fetchAllPages(table.fetchPage, 1000)).toHaveLength(2000);
  });

  it("keeps paging when the server caps responses below the requested page size", async () => {
    // The dangerous case: asking for 1000 but the server only ever gives 500.
    // A loop that stops on "got fewer rows than asked for" silently truncates.
    const table = fakeTable(rows(2500), 500);
    const result = await fetchAllPages(table.fetchPage, 1000);
    expect(result).toHaveLength(2500);
    expect(result).toEqual(rows(2500));
  });

  it("advances the window by the rows actually received, never skipping any", async () => {
    const table = fakeTable(rows(1200), 500);
    await fetchAllPages(table.fetchPage, 1000);
    expect(table.calls.map(([from]) => from)).toEqual([0, 500, 1000, 1200]);
  });

  it("throws when a page errors instead of returning a partial list", async () => {
    // Returning the rows fetched so far would be indistinguishable from a
    // genuinely short table, and callers would render a truncated list as if
    // it were complete.
    let call = 0;
    const promise = fetchAllPages(async () => {
      call += 1;
      if (call === 1) return { data: rows(1000), error: null };
      return { data: null, error: new Error("network down") };
    }, 1000);
    await expect(promise).rejects.toThrow("network down");
  });

  it("throws the original error object so callers can inspect it", async () => {
    const cause = new Error("JWT expired");
    await expect(fetchAllPages(async () => ({ data: null, error: cause }))).rejects.toBe(cause);
  });

  it("throws on a non-Error rejection value from PostgREST", async () => {
    await expect(
      fetchAllPages(async () => ({ data: null, error: { message: "bad range" } })),
    ).rejects.toThrow("bad range");
  });

  it("terminates instead of looping forever on a table that keeps serving rows", async () => {
    const table = fakeTable(rows(10_000), 1000);
    const result = await fetchAllPages(table.fetchPage, 1000);
    expect(result).toHaveLength(10_000);
    expect(table.calls.length).toBe(11);
  });
});
