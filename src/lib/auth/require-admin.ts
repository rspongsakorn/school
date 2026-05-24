import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentProfileRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) return null;
  return profile;
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
