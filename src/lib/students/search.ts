/** Escape user input for safe use inside PostgREST `.or()` ilike filters. */
export function escapeIlikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");
}

export function buildStudentSearchOrFilter(query: string): string {
  const pattern = escapeIlikePattern(query.trim());
  if (!pattern) return "";
  return `student_code.ilike.%${pattern}%,first_name.ilike.%${pattern}%,last_name.ilike.%${pattern}%`;
}
