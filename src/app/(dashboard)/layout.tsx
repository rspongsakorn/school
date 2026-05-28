"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/hooks/use-sidebar";

const TEACHER_ALLOWED_PATH = "/reports/outstanding";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !profile) return;
    if (profile.role === "teacher" && pathname !== TEACHER_ALLOWED_PATH) {
      router.replace(TEACHER_ALLOWED_PATH);
    }
  }, [isLoading, profile, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar />
        <div className="lg:ml-[260px]">{children}</div>
      </div>
    </SidebarProvider>
  );
}
