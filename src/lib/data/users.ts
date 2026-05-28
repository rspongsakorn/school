export type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "finance" | "teacher";
  isActive: boolean;
  createdAt: string;
};

/** Pure helper — merges auth user list with profiles array by id. Exported for testing. */
export function mergeUsers(
  authUsers: { id: string; email?: string; created_at: string }[],
  profiles: { id: string; role: string; display_name: string; is_active: boolean }[],
): UserRow[] {
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  return authUsers
    .filter((u) => profileMap.has(u.id))
    .map((u) => {
      const p = profileMap.get(u.id)!;
      return {
        id: u.id,
        email: u.email ?? "",
        displayName: p.display_name ?? "",
        role: p.role as UserRow["role"],
        isActive: p.is_active,
        createdAt: u.created_at,
      };
    });
}

/** Fetches all users from Supabase auth + profiles and merges them. */
export async function listUsers(): Promise<UserRow[]> {
  // Lazy import to avoid server-only constraint in test environment
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const [{ data: authData }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, role, display_name, is_active"),
  ]);

  return mergeUsers(authData?.users ?? [], profiles ?? []);
}
