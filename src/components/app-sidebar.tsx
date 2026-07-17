"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Calendar,
  ChartColumn,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSidebarContext } from "@/hooks/use-sidebar";
import { useAuth } from "@/components/providers/auth-provider";

type Role = "admin" | "finance" | "teacher";

const basicNav = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard, roles: ["admin", "finance"] as Role[] },
  { href: "/academic-year", label: "ปีการศึกษา", icon: Calendar, roles: ["admin"] as Role[] },
  { href: "/students", label: "นักเรียน", icon: Users, roles: ["admin", "finance"] as Role[] },
  { href: "/registration", label: "ลงทะเบียน", icon: ClipboardList, roles: ["admin", "finance"] as Role[] },
];

const financeNav = [
  { href: "/invoice-types", label: "ประเภทใบแจ้ง", icon: Receipt, roles: ["admin"] as Role[] },
  { href: "/invoices", label: "ใบแจ้งชำระ", icon: FileText, roles: ["admin", "finance"] as Role[] },
  { href: "/payments", label: "บันทึกการจ่าย", icon: CreditCard, roles: ["admin", "finance"] as Role[] },
];

const reportsNav = [
  { href: "/reports/daily", label: "รายรับรายวัน", roles: ["admin", "finance"] as Role[] },
  { href: "/reports/discounts", label: "รายงานส่วนลด", roles: ["admin", "finance"] as Role[] },
  { href: "/reports/outstanding", label: "รายงานค้างชำระ", roles: ["admin", "finance", "teacher"] as Role[] },
  { href: "/reports/collections", label: "สถิติการเก็บ", roles: ["admin", "finance", "teacher"] as Role[] },
  { href: "/reports/students", label: "รายบุคคล", roles: ["admin", "finance", "teacher"] as Role[] },
];

const systemNav = [
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: Settings2, roles: ["admin"] as Role[] },
];

function NavSection({
  title,
  items,
}: {
  title: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: Role[] }[];
}) {
  const pathname = usePathname();

  return (
    <div className="mb-6">
      <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
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
                  "relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-accent before:content-['']"
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

function NavReportsDropdown({ role }: { role?: Role }) {
  const pathname = usePathname();
  const items = reportsNav.filter((item) => role && item.roles.includes(role));
  const active = items.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const [open, setOpen] = useState(active);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={cn(
          "relative flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-accent before:content-['']"
            : "text-sidebar-foreground hover:bg-sidebar-accent",
        )}
      >
        <ChartColumn className="h-5 w-5 shrink-0" />
        รายงาน
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid overflow-hidden transition-all duration-200 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <ul className="min-h-0 space-y-1 py-1 pl-8">
          {items.map((item) => {
            const itemActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                    itemActive
                      ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SidebarContent() {
  const { profile } = useAuth();
  const role = profile?.role as Role | undefined;
  const pathname = usePathname();
  const visibleBasicNav = basicNav.filter((item) => role && item.roles.includes(role));
  const visibleFinanceNav = financeNav.filter((item) => role && item.roles.includes(role));

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
          <span className="truncate text-sm font-semibold leading-tight tracking-tight text-foreground">
            โรงเรียนบัวใหญ่วิทยา
          </span>
          <span className="truncate text-xs leading-tight text-muted-foreground">
            อ.บัวใหญ่ จ.นครราชสีมา
          </span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {role === "teacher" ? (
          <div className="mb-6">
            <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              รายงาน
            </h3>
            <NavReportsDropdown role={role} />
          </div>
        ) : (
          <>
            <NavSection title="ข้อมูลพื้นฐาน" items={visibleBasicNav} />
            <div className="mb-6">
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                การเงิน
              </h3>
              <ul className="space-y-1">
                {visibleFinanceNav.map((item) => {
                  const itemActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                          itemActive
                            ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-accent before:content-['']"
                            : "text-sidebar-foreground hover:bg-sidebar-accent",
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <NavReportsDropdown role={role} />
                </li>
              </ul>
            </div>
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
