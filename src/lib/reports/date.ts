const bangkokDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns the calendar day (YYYY-MM-DD) of an instant in Asia/Bangkok. */
export function bangkokDateKey(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return bangkokDateKeyFormatter.format(date);
}
