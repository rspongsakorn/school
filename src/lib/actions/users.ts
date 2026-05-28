"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";

/**
 * Pure helper — returns true if `excludeId` is the only active admin in the list.
 * Exported for unit testing.
 */
export function isLastAdmin(
  profiles: { id: string; role: string; is_active: boolean }[],
  excludeId: string,
): boolean {
  return (
    profiles.filter((p) => p.role === "admin" && p.is_active && p.id !== excludeId).length === 0
  );
}

function revalidate() {
  revalidatePath("/admin/users");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createUserAction(input: {
  email: string;
  displayName: string;
  role: "admin" | "finance" | "teacher";
  password: string;
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  // Lazy import to avoid server-only constraint in test environment
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      display_name: input.displayName.trim(),
      role: input.role,
      is_active: true,
    },
  });

  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update (role + display_name)
// ---------------------------------------------------------------------------

export async function updateUserAction(input: {
  userId: string;
  displayName: string;
  role: "admin" | "finance" | "teacher";
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  // Lazy import to avoid server-only constraint in test environment
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // Safety: if changing role away from admin, ensure not the last admin
  const { data: currentProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", input.userId)
    .maybeSingle();

  if (currentProfile?.role === "admin" && input.role !== "admin") {
    const { data: allProfiles } = await admin
      .from("profiles")
      .select("id, role, is_active");
    if (isLastAdmin(allProfiles ?? [], input.userId)) {
      return {
        ok: false,
        error: "ไม่สามารถเปลี่ยน role ได้ เนื่องจากต้องมี admin ที่ใช้งานได้อย่างน้อย 1 คน",
      };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: input.role, display_name: input.displayName.trim() })
    .eq("id", input.userId);

  if (error) return { ok: false, error: "ไม่สามารถแก้ไขข้อมูลผู้ใช้ได้" };
  revalidate();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

export async function resetPasswordAction(input: {
  userId: string;
  password: string;
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  // Lazy import to avoid server-only constraint in test environment
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.password,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Toggle active
// ---------------------------------------------------------------------------

export async function toggleActiveAction(input: {
  userId: string;
  isActive: boolean;
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  // Lazy import to avoid server-only constraint in test environment
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // Safety: if deactivating, check whether this user is the last active admin
  if (!input.isActive) {
    const { data: allProfiles } = await admin
      .from("profiles")
      .select("id, role, is_active");
    if (isLastAdmin(allProfiles ?? [], input.userId)) {
      return {
        ok: false,
        error: "ไม่สามารถปิดใช้งานได้ เนื่องจากต้องมี admin ที่ใช้งานได้อย่างน้อย 1 คน",
      };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ is_active: input.isActive })
    .eq("id", input.userId);

  if (error) return { ok: false, error: "ไม่สามารถเปลี่ยนสถานะผู้ใช้ได้" };
  revalidate();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteUserAction(input: {
  userId: string;
}): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  // Lazy import to avoid server-only constraint in test environment
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(input.userId);

  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
