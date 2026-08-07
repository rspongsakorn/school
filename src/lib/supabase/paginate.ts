/** Widest window we ask PostgREST for in one request. */
export const DEFAULT_PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

/** PostgREST errors are plain `{ message }` objects, not Error instances. */
function asError(error: unknown): unknown {
  if (error instanceof Error) return error;
  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error("โหลดข้อมูลไม่สำเร็จ");
}

/**
 * Read every row of a query, paging until the table is exhausted.
 *
 * PostgREST silently truncates a single select at its `max-rows` setting
 * (1000 on Supabase by default) — no error, just a short list — so any query
 * that can outgrow that has to be paged.
 *
 * The window advances by the number of rows actually received, never by the
 * requested page size. Those differ whenever the server's cap is smaller than
 * what we asked for, and a loop that stops on "fewer rows than requested"
 * would quietly drop the rest of the table in exactly that case.
 *
 * A failed page throws rather than returning the rows gathered so far: a
 * partial list is indistinguishable from a short table, so callers would render
 * it as complete. Throwing lets them retry or show an error instead.
 *
 * The caller's query MUST specify a stable sort. `range()` maps to SQL
 * OFFSET/LIMIT, and without ORDER BY Postgres gives no ordering guarantee
 * between requests, so rows can be repeated on one page and skipped on another.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw asError(error);
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
  }

  return rows;
}
