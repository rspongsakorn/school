import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session-profile";

export async function getCurrentProfileRole() {
  const profile = await getSessionProfile();
  if (!profile) return null;
  return {
    id: profile.id,
    role: profile.role,
    display_name: profile.display_name,
    is_active: profile.is_active,
  };
}

export async function requireAdminPage() {
  const profile = await getCurrentProfileRole();
  if (profile?.role !== "admin") {
    redirect("/");
  }
  return profile;
}

export async function requireAdminAction(): Promise<
  | { ok: true; profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfileRole>>> }
  | { ok: false; error: string }
> {
  const profile = await getCurrentProfileRole();
  if (!profile) {
    return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
  }
  if (profile.role !== "admin") {
    return { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };
  }
  return { ok: true, profile };
}
