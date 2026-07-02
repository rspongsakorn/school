import { redirect } from "next/navigation";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default async function DashboardPage() {
  // Server-side gate (defense in depth beyond the client layout redirect):
  // teachers only get the outstanding report; admin/finance see the dashboard.
  const profile = await getCurrentProfileRole();
  if (!profile) redirect("/login");
  if (profile.role === "teacher") redirect("/reports/outstanding");
  return <DashboardOverview />;
}
