function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  return Math.round((e - s) / 86_400_000);
}

export function defaultSemesterDates(yearStart: string, yearEnd: string) {
  const totalDays = daysBetween(yearStart, yearEnd);
  const half = Math.floor(totalDays / 2);
  const sem1End = addDays(yearStart, half);
  const sem2Start = addDays(sem1End, 1);

  return {
    semester1: { start: yearStart, end: sem1End },
    semester2: { start: sem2Start, end: yearEnd },
  };
}

export function nextSemesterDefaultDates(
  yearStart: string,
  yearEnd: string,
  existing: { start_date: string; end_date: string }[],
): { start: string; end: string } {
  if (existing.length === 0) {
    return defaultSemesterDates(yearStart, yearEnd).semester1;
  }

  const sorted = [...existing].sort((a, b) => a.end_date.localeCompare(b.end_date));
  const lastEnd = sorted[sorted.length - 1].end_date;
  const start = addDays(lastEnd, 1);
  if (start > yearEnd) {
    return { start: yearStart, end: yearEnd };
  }
  return { start, end: yearEnd };
}
