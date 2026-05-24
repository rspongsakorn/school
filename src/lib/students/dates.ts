const BE_OFFSET = 543;

export const THAI_MONTHS_LONG = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

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

export function formatYearDropdownBE(date: Date): string {
  return String(toBuddhistYear(date.getFullYear()));
}

export function formatMonthDropdownThai(date: Date): string {
  return THAI_MONTHS_LONG[date.getMonth()];
}

/** ช่วงวันเกิดที่เลือกได้: 100 ปีย้อนหลัง ถึงวันนี้ */
export function birthDatePickerRange(): { startMonth: Date; endMonth: Date } {
  const endMonth = new Date();
  const startMonth = new Date(endMonth.getFullYear() - 100, 0, 1);
  return { startMonth, endMonth };
}

export const BIRTH_MONTH_OPTIONS = THAI_MONTHS_LONG.map((label, index) => ({
  value: String(index + 1),
  label,
}));

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseBirthDateParts(iso: string): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!iso.trim()) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

export function birthDatePartsToIso(parts: {
  year: number;
  month: number;
  day: number;
}): string {
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function birthYearOptions(): { value: string; label: string }[] {
  const { startMonth, endMonth } = birthDatePickerRange();
  const minYear = startMonth.getFullYear();
  const maxYear = endMonth.getFullYear();
  const options: { value: string; label: string }[] = [];
  for (let year = maxYear; year >= minYear; year -= 1) {
    options.push({ value: String(year), label: String(toBuddhistYear(year)) });
  }
  return options;
}

export function buildBirthDateIso(parts: {
  year: string;
  month: string;
  day: string;
}): string {
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (!year || !month || !day) return "";
  const maxDay = daysInMonth(year, month);
  const clampedDay = Math.min(day, maxDay);
  return birthDatePartsToIso({ year, month, day: clampedDay });
}
