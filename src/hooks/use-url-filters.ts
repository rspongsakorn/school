"use client";

import { usePathname, useRouter } from "next/navigation";
import { mergeQuery } from "@/lib/reports/url-filters";

/**
 * Write report filters to the URL. Reads the live query at call time, so two
 * quick changes do not overwrite each other with a stale copy.
 *
 * Selects and dates push (Back steps through them, as elsewhere in the app);
 * pass `replace` for typing, so a search is one history entry, not one per key.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    next: Record<string, string | undefined>,
    defaults: Record<string, string>,
    opts: { replace?: boolean } = {},
  ) => {
    const query = mergeQuery(window.location.search, next, defaults);
    const href = query ? `${pathname}?${query}` : pathname;
    if (opts.replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  };
}
