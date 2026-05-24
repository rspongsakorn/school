const thaiDateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatBaht(amount: number) {
  return `฿${amount.toLocaleString("th-TH")}`;
}

export function formatThaiDate(iso: string | Date) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return thaiDateFormatter.format(date);
}

export function formatStudentName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export function formatClassroom(gradeName: string | null, classroomName: string | null) {
  if (gradeName && classroomName) return `${gradeName}/${classroomName}`;
  if (gradeName) return gradeName;
  return "—";
}
