"use client";

import { useEffect } from "react";

/**
 * Triggers the browser print dialog automatically once fonts are ready.
 * Rendered only when the receipt is opened with ?autoprint=1 (e.g. inside
 * the hidden print iframe on the payments page).
 */
export function AutoPrint() {
  useEffect(() => {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      window.focus();
      window.print();
    };

    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => setTimeout(run, 150));
      // Fallback in case fonts.ready never resolves
      const fallback = setTimeout(run, 1200);
      return () => clearTimeout(fallback);
    }

    const timer = setTimeout(run, 500);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
