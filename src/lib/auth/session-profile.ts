import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SessionProfile = {
  id: string;
  role: "admin" | "finance" | "teacher";
  display_name: string | null;
  is_active: boolean;
  email: string;
};

/** One auth + profile fetch per request (dedupes proxy overlap on pages). */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active) return null;

  return {
    id: profile.id,
    role: profile.role as SessionProfile["role"],
    display_name: profile.display_name,
    is_active: profile.is_active,
    email: user.email ?? "",
  };
});
