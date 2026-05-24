"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AcademicYearRow } from "@/lib/data/academic-years";
import { YearTable } from "@/components/academic-year/year-table";
import { YearWizardDialog } from "@/components/academic-year/year-wizard-dialog";
import { YearEditDialog } from "@/components/academic-year/year-edit-dialog";

type AcademicYearPanelProps = {
  years: AcademicYearRow[];
};

export function AcademicYearPanel({ years }: AcademicYearPanelProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYearRow | null>(null);

  return (
    <>
      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>จัดการปีการศึกษา</CardTitle>
            <CardDescription>กำหนดช่วงปีการศึกษาและภาคเรียนสำหรับการใช้งานในระบบ</CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}>เพิ่มปีการศึกษา</Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <YearTable years={years} onEdit={setEditingYear} />
        </CardContent>
      </Card>

      <YearWizardDialog open={createOpen} onOpenChange={setCreateOpen} />
      <YearEditDialog
        open={Boolean(editingYear)}
        onOpenChange={(open) => {
          if (!open) setEditingYear(null);
        }}
        year={editingYear}
      />
    </>
  );
}
