/**
 * The pages a teacher may stay on: the reports the sidebar offers them (see
 * reportsNav in app-sidebar.tsx). Anywhere else the dashboard layout sends them
 * back to TEACHER_HOME. The debtors report is not among them: it sums a student's
 * debt over every year, and a teacher's row-level view holds only the years and
 * rooms they were assigned, so it would show wrong rooms and short totals. The data is scoped separately — the database only lets
 * a teacher read students of their own classrooms.
 */
export const TEACHER_HOME = "/reports/outstanding";

const EXACT = new Set([
  "/reports",
  "/reports/outstanding",
  "/reports/collections",
  "/reports/students",
]);

export function teacherMayVisit(pathname: string): boolean {
  if (EXACT.has(pathname)) return true;
  // One student's statement: /reports/students/<id>, and nothing deeper.
  return /^\/reports\/students\/[^/]+$/.test(pathname);
}
