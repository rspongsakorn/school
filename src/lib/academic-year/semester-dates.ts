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
