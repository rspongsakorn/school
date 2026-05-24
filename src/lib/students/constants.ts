export type StudentStatus = "active" | "graduated" | "transferred" | "withdrawn";

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: "กำลังศึกษา",
  graduated: "จบการศึกษา",
  transferred: "ย้ายออก",
  withdrawn: "ลาออก",
};

export const STUDENT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "active", label: "กำลังศึกษา" },
  { value: "graduated", label: "จบการศึกษา" },
  { value: "transferred", label: "ย้ายออก" },
  { value: "withdrawn", label: "ลาออก" },
] as const;

export const STUDENTS_PAGE_SIZE = 50;
