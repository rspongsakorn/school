import { AppHeader } from "@/components/app-header";
import { GradeStats } from "@/components/dashboard/grade-stats";
import { OverdueList } from "@/components/dashboard/overdue-list";
import { RecentPaymentsTable } from "@/components/dashboard/recent-payments-table";
import { StatCards } from "@/components/dashboard/stat-cards";

export default function DashboardPage() {
  return (
    <>
      <AppHeader title="ภาพรวม" />
      <main className="p-6">
        <div className="space-y-6">
          <StatCards />
          <RecentPaymentsTable />
          <div className="grid gap-6 lg:grid-cols-2">
            <OverdueList />
            <GradeStats />
          </div>
        </div>
      </main>
    </>
  );
}
