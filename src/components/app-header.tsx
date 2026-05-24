"use client";

import { ChevronDown, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Select defaultValue="2568">
            <SelectTrigger className="h-9 w-[100px] border-border bg-background">
              <SelectValue placeholder="ปี" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2568">2568</SelectItem>
              <SelectItem value="2567">2567</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="1">
            <SelectTrigger className="h-9 w-[90px] border-border bg-background">
              <SelectValue placeholder="ภาค" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">ภาค 1</SelectItem>
              <SelectItem value="2">ภาค 2</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium">คุณสมศรี</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>โปรไฟล์</DropdownMenuItem>
            <DropdownMenuItem>ออกจากระบบ</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
