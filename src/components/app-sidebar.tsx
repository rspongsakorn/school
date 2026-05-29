"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ChartColumn,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings2,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSidebarContext } from "@/hooks/use-sidebar";
import { useAuth } from "@/components/providers/auth-provider";

const basicNav = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/academic-year", label: "ปีการศึกษา", icon: Calendar },
  { href: "/students", label: "นักเรียน", icon: Users },
  { href: "/registration", label: "ลงทะเบียน", icon: ClipboardList },
];

const financeNav = [
  { href: "/fee-rates", label: "ตั้งค่าค่าธรรมเนียม", icon: SlidersHorizontal },
  { href: "/receipt-types", label: "ประเภทใบเสร็จ", icon: Receipt },
  { href: "/invoices", label: "ใบแจ้งชำระ", icon: FileText },
  { href: "/payments", label: "บันทึกการจ่าย", icon: CreditCard },
  { href: "/reports/daily", label: "รายรับรายวัน", icon: ChartColumn },
  { href: "/reports/outstanding", label: "รายงานค้างชำระ", icon: ChartColumn },
  { href: "/reports/collections", label: "สถิติการเก็บ", icon: ChartColumn },
  { href: "/reports/students", label: "รายบุคคล", icon: ChartColumn },
];

const systemNav = [
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: Settings2 },
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
      <h3 className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-accent-foreground/60">
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
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

const teacherNav = [
  { href: "/reports/outstanding", label: "รายงานค้างชำระ", icon: ChartColumn },
  { href: "/reports/collections", label: "สถิติการเก็บ", icon: ChartColumn },
  { href: "/reports/students", label: "รายบุคคล", icon: ChartColumn },
];

function SidebarContent() {
  const { profile } = useAuth();
  const role = profile?.role;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <Image
          src="/logo.png"
          alt="โรงเรียนบัวใหญ่วิทยา"
          width={48}
          height={48}
          className="shrink-0 rounded-full object-cover"
          priority
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">
            โรงเรียนบัวใหญ่วิทยา
          </span>
          <span className="truncate text-xs leading-tight text-sidebar-accent-foreground/60">
            อ.บัวใหญ่ จ.นครราชสีมา
          </span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {role === "teacher" ? (
          <NavSection title="รายงาน" items={teacherNav} />
        ) : (
          <>
            <NavSection title="ข้อมูลพื้นฐาน" items={basicNav} />
            <NavSection title="การเงิน" items={financeNav} />
            {role === "admin" && (
              <NavSection title="ระบบ" items={systemNav} />
            )}
          </>
        )}
      </nav>
    </>
  );
}

export function AppSidebar() {
  const { isOpen, close } = useSidebarContext();

  return (
    <>
      {/* Desktop: fixed sidebar, hidden on mobile */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile: Sheet drawer */}
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
        <SheetContent side="left" className="w-[260px] bg-sidebar p-0" showCloseButton={false}>
          <div className="flex h-full flex-col">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
