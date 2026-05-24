type DateRange = { start: string; end: string };

export function isValidDateRange(start: string, end: string): boolean {
  return end >= start;
}

export function isSemesterOutsideYear(year: DateRange, semester: DateRange): boolean {
  return semester.start < year.start || semester.end > year.end;
}
