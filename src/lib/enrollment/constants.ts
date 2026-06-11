export type EnrollmentStatus = "enrolled" | "transferred" | "withdrawn";

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  enrolled: "กำลังศึกษา",
  transferred: "ย้ายออก",
  withdrawn: "ลาออก",
};

export const ENROLLMENT_STATUS_OPTIONS: { value: EnrollmentStatus; label: string }[] = [
  { value: "transferred", label: ENROLLMENT_STATUS_LABELS.transferred },
  { value: "withdrawn", label: ENROLLMENT_STATUS_LABELS.withdrawn },
];
