import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="ml-[260px]">{children}</div>
    </div>
  );
}
