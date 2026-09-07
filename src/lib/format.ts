const thaiDateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

const thaiDateFormatterLong = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

export function formatBaht(amount: number) {
  return `฿${amount.toLocaleString("th-TH")}`;
}

export function formatThaiDate(iso: string | Date) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return thaiDateFormatter.format(date);
}

export function formatThaiDateLong(iso: string | Date) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return thaiDateFormatterLong.format(date);
}

const thaiTimeFormatter = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatThaiTime(iso: string | Date) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return thaiTimeFormatter.format(date);
}

export function formatStudentName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export function formatClassroom(gradeName: string | null, classroomName: string | null) {
  if (gradeName && classroomName) return `${gradeName}/${classroomName}`;
  if (gradeName) return gradeName;
  return "—";
}

// Thai school levels sort alphabetically in the wrong order (ป. before ตอ./อ.),
// so a grade name comparison needs this level ranking, not locale order.
const GRADE_LEVEL_PREFIX_ORDER = ["ตอ.", "อ.", "ป.", "ม.", "ปวช.", "ปวส."];

function gradeLevelRank(name: string): number {
  const idx = GRADE_LEVEL_PREFIX_ORDER.findIndex((prefix) => name.startsWith(prefix));
  return idx === -1 ? GRADE_LEVEL_PREFIX_ORDER.length : idx;
}

/** Compares grade-level names by school level first (อ. < ป. < ม. < ปวช. < ปวส.), then by number. */
export function compareGradeLevelNames(a: string, b: string): number {
  const rankDiff = gradeLevelRank(a) - gradeLevelRank(b);
  return rankDiff !== 0 ? rankDiff : a.localeCompare(b, "th", { numeric: true });
}

/**
 * Compares grade levels by their configured sort_order, falling back to school-level
 * name order when sort_order ties (it defaults to 0 for every grade).
 */
export function compareGradeLevels(
  a: { name: string; sort_order: number },
  b: { name: string; sort_order: number },
): number {
  const diff = a.sort_order - b.sort_order;
  return diff !== 0 ? diff : compareGradeLevelNames(a.name, b.name);
}

/**
 * Same ordering as {@link compareGradeLevels}, collapsed into a single number so
 * callers that can only carry a numeric sort key still order ตอ. → อ. → ป. → ม.
 */
export function gradeLevelSortKey(name: string, sortOrder = 0): number {
  const year = /(\d+)/.exec(name);
  return sortOrder * 100_000 + gradeLevelRank(name) * 1_000 + (year ? Number(year[1]) : 0);
}

/** แปลงจำนวนเงิน (บาท) เป็นตัวอักษรภาษาไทย เช่น 3100 → "สามพันหนึ่งร้อยบาทถ้วน" */
export function bahtText(amount: number): string {
  const satang = Math.round((amount % 1) * 100);
  const baht = Math.floor(amount);
  if (baht === 0 && satang === 0) return "ศูนย์บาทถ้วน";
  const bahtStr = baht === 0 ? "" : thaiNumberText(baht);
  if (satang === 0) return `${bahtStr}บาทถ้วน`;
  return `${bahtStr}บาท${thaiNumberText(satang)}สตางค์`;
}

function thaiNumberText(n: number): string {
  if (n <= 0) return "";
  const u = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  if (n < 10) return u[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    const tensStr = t === 1 ? "สิบ" : t === 2 ? "ยี่สิบ" : u[t] + "สิบ";
    const onesStr = o === 0 ? "" : o === 1 ? "เอ็ด" : u[o];
    return tensStr + onesStr;
  }
  if (n < 1000) return u[Math.floor(n / 100)] + "ร้อย" + thaiNumberText(n % 100);
  if (n < 10000) return u[Math.floor(n / 1000)] + "พัน" + thaiNumberText(n % 1000);
  if (n < 100000) return u[Math.floor(n / 10000)] + "หมื่น" + thaiNumberText(n % 10000);
  if (n < 1000000) return u[Math.floor(n / 100000)] + "แสน" + thaiNumberText(n % 100000);
  return thaiNumberText(Math.floor(n / 1000000)) + "ล้าน" + thaiNumberText(n % 1000000);
}
