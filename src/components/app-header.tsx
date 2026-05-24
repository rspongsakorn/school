"use client";

import { UserMenu } from "@/components/auth/user-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AppHeaderProps = {
  title: string;
  displayName: string;
  yearName?: string;
  semesterNumber?: number;
};

export function AppHeader({
  title,
  displayName,
  yearName,
  semesterNumber,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {yearName ? (
          <p className="text-xs text-muted-foreground">
            ภาคเรียนที่ {semesterNumber ?? 1} · ปี {yearName}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Select value={yearName ?? "none"} disabled>
            <SelectTrigger className="h-9 w-[100px] border-border bg-background">
              <SelectValue placeholder="ปี" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={yearName ?? "none"}>{yearName ?? "—"}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(semesterNumber ?? 1)} disabled>
            <SelectTrigger className="h-9 w-[90px] border-border bg-background">
              <SelectValue placeholder="ภาค" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(semesterNumber ?? 1)}>
                ภาค {semesterNumber ?? 1}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <UserMenu displayName={displayName} />
      </div>
    </header>
  );
}
