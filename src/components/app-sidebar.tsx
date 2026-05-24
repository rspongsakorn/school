"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ChartColumn,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const basicNav = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/academic-year", label: "ปีการศึกษา", icon: Calendar },
  { href: "/students", label: "นักเรียน", icon: Users },
];

const registrationNav = [
  { href: "/registration/setup", label: "ตั้งค่าชั้น/ห้อง", icon: Settings2 },
  { href: "/registration", label: "ลงทะเบียนนักเรียน", icon: ClipboardList },
];

const financeNav = [
  { href: "/payments", label: "บันทึกการจ่าย", icon: CreditCard },
  { href: "/invoices", label: "ใบแจ้งชำระ", icon: FileText },
  { href: "/reports", label: "รายงาน", icon: ChartColumn },
];

function NavSection({
  title,
  items,
}: {
  title: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  const pathname = usePathname();

  return (
    <div className="mb-6">
      <h3 className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/registration" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[260px] flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-3 border-b border-border px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <GraduationCap className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">โรงเรียนตัวอย่าง</span>
          <span className="text-xs text-muted-foreground">ประถมศึกษา</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavSection title="ข้อมูลพื้นฐาน" items={basicNav} />
        <NavSection title="ลงทะเบียน" items={registrationNav} />
        <NavSection title="การเงิน" items={financeNav} />
      </nav>
    </aside>
  );
}
