const BE_OFFSET = 543;

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const;

export function toBuddhistYear(ceYear: number): number {
  return ceYear + BE_OFFSET;
}

export function parseIsoDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDateFromLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatThaiBirthDate(isoDate: string): string {
  const date = parseIsoDateOnly(isoDate);
  const day = date.getDate();
  const month = THAI_MONTHS_SHORT[date.getMonth()];
  const beYear = toBuddhistYear(date.getFullYear());
  return `${day} ${month} ${beYear}`;
}

export function isFutureIsoDate(isoDate: string): boolean {
  const today = isoDateFromLocalDate(new Date());
  return isoDate > today;
}
