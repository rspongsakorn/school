"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft, Plus, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ClassroomRow, ClassroomWithGradeRow } from "@/lib/data/classrooms";
import type { EnrollmentRosterRow, StudentEnrollmentCandidate } from "@/lib/data/enrollments";
import type { GradeLevelRow } from "@/lib/data/grade-levels";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/enrollment/constants";
import type { AcademicYearOption } from "@/lib/enrollment/year-params";
import { YearSelect } from "@/components/registration/year-select";
import { EnrollStudentDialog } from "@/components/registration/enroll-student-dialog";
import { MoveClassroomDialog } from "@/components/registration/move-classroom-dialog";
import { EnrollmentStatusDialog } from "@/components/registration/enrollment-status-dialog";

type RegistrationPanelProps = {
  years: AcademicYearOption[];
  selectedYearId: string;
  grades: GradeLevelRow[];
  selectedGradeId: string | null;
  classrooms: ClassroomRow[];
  selectedClassroomId: string | null;
  roster: EnrollmentRosterRow[];
  allClassrooms: ClassroomWithGradeRow[];
  enrollCandidates: StudentEnrollmentCandidate[];
  isAdmin: boolean;
};

export function RegistrationPanel({
  years,
  selectedYearId,
  grades,
  selectedGradeId,
  classrooms,
  selectedClassroomId,
  roster,
  allClassrooms,
  enrollCandidates,
  isAdmin,
}: RegistrationPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<EnrollmentRosterRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<EnrollmentRosterRow | null>(null);

  function buildUrl(updates: { grade?: string | null; classroom?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", selectedYearId);
    if (updates.grade !== undefined) {
      if (updates.grade) params.set("grade", updates.grade);
      else params.delete("grade");
    }
    if (updates.classroom !== undefined) {
      if (updates.classroom) params.set("classroom", updates.classroom);
      else params.delete("classroom");
    }
    return `/registration?${params.toString()}`;
  }

  function selectGrade(gradeId: string) {
    router.push(buildUrl({ grade: gradeId, classroom: null }));
  }

  function selectClassroom(classroomId: string) {
    router.push(buildUrl({ classroom: classroomId }));
  }

  const selectedClassroom = classrooms.find((c) => c.id === selectedClassroomId);

  return (
    <div className="space-y-6">
      <YearSelect years={years} selectedYearId={selectedYearId} basePath="/registration" />

      {grades.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีชั้นเรียนในปีนี้ —{" "}
            <Link href="/registration/setup" className="text-primary underline-offset-4 hover:underline">
              ตั้งค่าชั้น/ห้อง
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[200px_200px_1fr]">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ชั้นเรียน</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <ul>
                {grades.map((grade) => (
                  <li key={grade.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full px-4 py-2 text-left text-sm",
                        grade.id === selectedGradeId
                          ? "bg-primary/10 font-medium"
                          : "hover:bg-muted/50",
                      )}
                      onClick={() => selectGrade(grade.id)}
                    >
                      {grade.name}
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ห้องเรียน</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {classrooms.length === 0 ? (
                <p className="px-4 py-2 text-sm text-muted-foreground">ยังไม่มีห้อง</p>
              ) : (
                <ul>
                  {classrooms.map((classroom) => (
                    <li key={classroom.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm",
                          classroom.id === selectedClassroomId
                            ? "bg-primary/10 font-medium"
                            : "hover:bg-muted/50",
                        )}
                        onClick={() => selectClassroom(classroom.id)}
                      >
                        <span>{classroom.name}</span>
                        <Badge variant="secondary" className="shrink-0">
                          {classroom.enrolled_count}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {selectedClassroom ? `ห้อง ${selectedClassroom.name}` : "รายชื่อในห้อง"}
                </CardTitle>
                <CardDescription>{roster.length} คน</CardDescription>
              </div>
              {isAdmin && selectedClassroomId && (
                <Button size="sm" onClick={() => setEnrollOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  เพิ่มนักเรียน
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {!selectedClassroomId ? (
                <p className="text-sm text-muted-foreground">เลือกห้องเรียนเพื่อดูรายชื่อ</p>
              ) : roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  ยังไม่มีนักเรียนในห้องนี้
                  {isAdmin && " — กดเพิ่มนักเรียนเพื่อลงทะเบียน"}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>รหัส</TableHead>
                      <TableHead>ชื่อ-นามสกุล</TableHead>
                      <TableHead>สถานะ</TableHead>
                      {isAdmin && <TableHead className="w-[140px]">จัดการ</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.map((row) => (
                      <TableRow key={row.enrollmentId}>
                        <TableCell className="font-mono text-sm">{row.studentCode}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {ENROLLMENT_STATUS_LABELS[row.status]}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="ย้ายห้อง"
                                onClick={() => setMoveTarget(row)}
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                title="เปลี่ยนสถานะ"
                                onClick={() => setStatusTarget(row)}
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {isAdmin && selectedClassroomId && (
        <EnrollStudentDialog
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          academicYearId={selectedYearId}
          classroomId={selectedClassroomId}
          initialCandidates={enrollCandidates}
        />
      )}

      {moveTarget && selectedClassroomId && (
        <MoveClassroomDialog
          open={Boolean(moveTarget)}
          onOpenChange={(open) => !open && setMoveTarget(null)}
          enrollmentId={moveTarget.enrollmentId}
          studentName={moveTarget.name}
          currentClassroomId={selectedClassroomId}
          classrooms={allClassrooms}
        />
      )}

      {statusTarget && (
        <EnrollmentStatusDialog
          open={Boolean(statusTarget)}
          onOpenChange={(open) => !open && setStatusTarget(null)}
          enrollmentId={statusTarget.enrollmentId}
          studentName={statusTarget.name}
        />
      )}
    </div>
  );
}
