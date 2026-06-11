export type SourceEnrollment = {
  student_id: string;
  classroom_id: string;
};

export type CarryForwardRow = {
  student_id: string;
  classroom_id: string;
  academic_year_id: string;
  semester_id: string;
  status: "enrolled";
};

export function buildCarryForwardEnrollments(input: {
  sourceEnrollments: SourceEnrollment[];
  targetClassroomBySource: Map<string, string>;
  targetSemesterId: string;
  targetAcademicYearId: string;
}): CarryForwardRow[] {
  const { sourceEnrollments, targetClassroomBySource, targetSemesterId, targetAcademicYearId } =
    input;

  const rows: CarryForwardRow[] = [];
  for (const enrollment of sourceEnrollments) {
    const targetClassroomId = targetClassroomBySource.get(enrollment.classroom_id);
    if (!targetClassroomId) continue;
    rows.push({
      student_id: enrollment.student_id,
      classroom_id: targetClassroomId,
      academic_year_id: targetAcademicYearId,
      semester_id: targetSemesterId,
      status: "enrolled",
    });
  }
  return rows;
}
