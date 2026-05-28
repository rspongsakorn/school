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
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSidebarContext } from "@/hooks/use-sidebar";

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
  { href: "/reports/outstanding", label: "รายงานค้างชำระ", icon: ChartColumn },
  { href: "/reports/collections", label: "สรุปการเก็บ", icon: ChartColumn },
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
            pathname === item.href || pathname.startsWith(`${item.href}/`);
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

function SidebarContent() {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <Image
          src="/logo.png"
          alt="โรงเรียนบัวใหญ่วิทยา"
          width={44}
          height={44}
          className="shrink-0 rounded-full"
          priority
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">โรงเรียนบัวใหญ่วิทยา</span>
          <span className="text-xs text-muted-foreground">อ.บัวใหญ่ จ.นครราชสีมา</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavSection title="ข้อมูลพื้นฐาน" items={basicNav} />
        <NavSection title="การเงิน" items={financeNav} />
      </nav>
    </>
  );
}

export function AppSidebar() {
  const { isOpen, close } = useSidebarContext();

  return (
    <>
      {/* Desktop: fixed sidebar, hidden on mobile */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-border bg-sidebar lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile: Sheet drawer */}
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
        <SheetContent side="left" className="w-[260px] p-0" showCloseButton={false}>
          <div className="flex h-full flex-col">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
