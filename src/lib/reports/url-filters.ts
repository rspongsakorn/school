/**
 * Report filters live in the URL so that Back, refresh and a copied link all
 * bring the same report back. A filter at its default is left out of the URL;
 * every param a page does not own (year, semester, …) is carried through.
 */

/** The new query string, without a leading "?". */
export function mergeQuery(
  current: string,
  next: Record<string, string | undefined>,
  defaults: Record<string, string>,
): string {
  const params = new URLSearchParams(current.startsWith("?") ? current.slice(1) : current);
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === "" || value === defaults[key]) params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}

/** A real calendar date as YYYY-MM-DD, or the fallback. */
export function parseDateParam(raw: string | null, fallback: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? raw : fallback;
}

export function parseEnumParam<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function withQuery(path: string, query: string): string {
  const q = query.startsWith("?") ? query.slice(1) : query;
  return q ? `${path}?${q}` : path;
}

/** A student's statement, carrying the roster's filters so it can lead back. */
export function statementHref(studentId: string, rosterQuery: string): string {
  return withQuery(`/reports/students/${studentId}`, rosterQuery);
}

/** Back to the roster with the filters the statement was opened from. */
export function rosterHref(statementQuery: string): string {
  return withQuery("/reports/students", statementQuery);
}
