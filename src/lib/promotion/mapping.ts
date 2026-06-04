export type GradeRef = { id: string; name: string; sortOrder: number };
export type ClassroomRef = { id: string; name: string };

export type GradeMapping = { sourceGradeId: string; targetGradeId: string | null };
export type ClassroomMapping = {
  sourceClassroomId: string;
  targetClassroomId: string | null;
};

/** ชั้นต้นทางลำดับที่ i -> ชั้นปลายทางลำดับที่ i+1; ตัวสุดท้าย -> null (จบการศึกษา) */
export function mapGradesByOrder(source: GradeRef[], target: GradeRef[]): GradeMapping[] {
  const sortedSource = [...source].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedTarget = [...target].sort((a, b) => a.sortOrder - b.sortOrder);
  return sortedSource.map((grade, index) => ({
    sourceGradeId: grade.id,
    targetGradeId: sortedTarget[index + 1]?.id ?? null,
  }));
}

/** จับคู่ห้องต้นทาง -> ห้องปลายทางที่ชื่อ (trim) ตรงกัน; ไม่พบ -> null */
export function mapClassroomsByName(
  source: ClassroomRef[],
  target: ClassroomRef[],
): ClassroomMapping[] {
  const targetByName = new Map(target.map((room) => [room.name.trim(), room.id]));
  return source.map((room) => ({
    sourceClassroomId: room.id,
    targetClassroomId: targetByName.get(room.name.trim()) ?? null,
  }));
}
