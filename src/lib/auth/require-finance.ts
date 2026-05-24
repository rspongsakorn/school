import { redirect } from "next/navigation";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";

export async function requireFinancePage() {
  const profile = await getCurrentProfileRole();
  if (!profile || (profile.role !== "admin" && profile.role !== "finance")) {
    redirect("/");
  }
  return profile;
}

export async function requireFinanceAction() {
  const profile = await getCurrentProfileRole();
  if (!profile) {
    return { ok: false as const, error: "กรุณาเข้าสู่ระบบ" };
  }
  if (profile.role !== "admin" && profile.role !== "finance") {
    return { ok: false as const, error: "ไม่มีสิทธิ์ดำเนินการ" };
  }
  return { ok: true as const, profile };
}

export async function requireReportPage() {
  const profile = await getCurrentProfileRole();
  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "finance" && profile.role !== "teacher")
  ) {
    redirect("/");
  }
  return profile;
}
