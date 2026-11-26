import { formatThaiDate } from "@/lib/format";

/**
 * The quick ranges offered beside a report's date fields. Dates are
 * YYYY-MM-DD calendar days in Bangkok (see bangkokDateKey for "today").
 */
export type DatePreset = "today" | "month" | "semester";

export function presetRange(
  preset: DatePreset,
  todayKey: string,
  semester?: { start: string | null; end: string | null },
): { from: string; to: string } | null {
  if (preset === "today") return { from: todayKey, to: todayKey };
  if (preset === "month") return { from: `${todayKey.slice(0, 8)}01`, to: todayKey };
  if (!semester?.start || !semester.end) return null;
  return { from: semester.start, to: semester.end };
}

/** "9 ก.ย. 2569", or "1 ก.ย. 2569 – 26 พ.ย. 2569" for a span. */
export function formatThaiRange(from: string, to: string): string {
  const thai = (key: string) => formatThaiDate(`${key}T00:00:00+07:00`);
  return from === to ? thai(from) : `${thai(from)} – ${thai(to)}`;
}
