export const SEMESTER_YEAR_COOKIE = "school_year_id";
export const SEMESTER_NUMBER_COOKIE = "school_semester";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function setSemesterCookie(yearId: string, semesterNumber: 1 | 2) {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  const base = `path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`;
  const suffix = secure ? "; Secure" : "";
  document.cookie = `${SEMESTER_YEAR_COOKIE}=${encodeURIComponent(yearId)}; ${base}${suffix}`;
  document.cookie = `${SEMESTER_NUMBER_COOKIE}=${semesterNumber}; ${base}${suffix}`;
}

export function readSemesterCookieFromDocument(): {
  yearId: string | null;
  semesterNumber: 1 | 2 | null;
} {
  if (typeof document === "undefined") {
    return { yearId: null, semesterNumber: null };
  }

  const cookies = Object.fromEntries(
    document.cookie.split("; ").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key, rest.join("=")];
    }),
  );

  const yearId = cookies[SEMESTER_YEAR_COOKIE]
    ? decodeURIComponent(cookies[SEMESTER_YEAR_COOKIE])
    : null;
  const rawSemester = cookies[SEMESTER_NUMBER_COOKIE];
  const semesterNumber = rawSemester === "2" ? 2 : rawSemester === "1" ? 1 : null;

  return { yearId, semesterNumber };
}
