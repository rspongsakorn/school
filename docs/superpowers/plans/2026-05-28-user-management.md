# User Management Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/admin/users` page for creating, editing, deactivating, resetting passwords, and deleting system user accounts.

**Architecture:** Server Component page inside the existing dashboard layout, guarded by `requireAdminPage()`. Mutations are Next.js Server Actions using a Supabase admin client (service role key). User list merges `supabase.auth.admin.listUsers()` with the `profiles` table. A new "ระบบ" sidebar section shows only for admin users.

**Tech Stack:** Next.js 16 App Router, Supabase JS v2 Admin API, React 19, Tailwind CSS, shadcn/ui (Dialog, AlertDialog, Table, Badge, Select, Input, Button)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/supabase/admin.ts` | Create | Supabase admin client (service role key) |
| `src/lib/data/users.ts` | Create | `UserRow` type, `mergeUsers()` pure helper, `listUsers()` |
| `src/lib/data/users.test.ts` | Create | Tests for `mergeUsers()` |
| `src/lib/actions/users.ts` | Create | Server Actions + `isLastAdmin()` pure helper |
| `src/lib/actions/users.test.ts` | Create | Tests for `isLastAdmin()` |
| `src/app/(dashboard)/admin/users/page.tsx` | Create | Server Component — auth + data fetch |
| `src/app/(dashboard)/admin/users/users-panel.tsx` | Create | Client Component — table + 4 dialogs |
| `src/components/app-sidebar.tsx` | Modify | Add "ระบบ" section (admin-only) |

---

## Task 1: Supabase Admin Client + Env Setup

**Files:**
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1: Add env var to `.env.local`**

Open `.env.local` and add (get the value from your Supabase project → Settings → API → service_role key):

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

⚠️ Never prefix this with `NEXT_PUBLIC_` — it must stay server-only.

- [ ] **Step 2: Create the admin client file**

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Supabase admin client using service role key.
 * Bypasses RLS. ONLY import this in server-side code (Server Components, Server Actions).
 * Never import from client components or files that run in the browser.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/admin.ts
git commit -m "feat: add Supabase admin client for service role operations"
```

---

## Task 2: User Data Layer (TDD)

**Files:**
- Create: `src/lib/data/users.ts`
- Create: `src/lib/data/users.test.ts`

- [ ] **Step 1: Write failing tests for `mergeUsers`**

Create `src/lib/data/users.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeUsers } from "./users";

describe("mergeUsers", () => {
  it("merges auth users with profiles by id", () => {
    const authUsers = [
      { id: "u1", email: "admin@school.ac.th", created_at: "2026-01-01T00:00:00Z" },
    ];
    const profiles = [
      { id: "u1", role: "admin", display_name: "นางสาวสมใจ", is_active: true },
    ];
    const result = mergeUsers(authUsers, profiles);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "u1",
      email: "admin@school.ac.th",
      displayName: "นางสาวสมใจ",
      role: "admin",
      isActive: true,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("excludes auth users with no matching profile", () => {
    const authUsers = [
      { id: "u1", email: "ghost@school.ac.th", created_at: "2026-01-01T00:00:00Z" },
    ];
    const profiles: { id: string; role: string; display_name: string; is_active: boolean }[] = [];
    const result = mergeUsers(authUsers, profiles);
    expect(result).toHaveLength(0);
  });

  it("falls back to empty string when email or display_name is missing", () => {
    const authUsers = [{ id: "u1", email: undefined as unknown as string, created_at: "2026-01-01T00:00:00Z" }];
    const profiles = [{ id: "u1", role: "teacher", display_name: "", is_active: false }];
    const result = mergeUsers(authUsers, profiles);
    expect(result[0].email).toBe("");
    expect(result[0].displayName).toBe("");
    expect(result[0].isActive).toBe(false);
  });

  it("handles multiple users and preserves order", () => {
    const authUsers = [
      { id: "u1", email: "a@s.th", created_at: "2026-01-01T00:00:00Z" },
      { id: "u2", email: "b@s.th", created_at: "2026-01-02T00:00:00Z" },
    ];
    const profiles = [
      { id: "u1", role: "admin", display_name: "A", is_active: true },
      { id: "u2", role: "finance", display_name: "B", is_active: true },
    ];
    const result = mergeUsers(authUsers, profiles);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("u1");
    expect(result[1].role).toBe("finance");
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/lib/data/users.test.ts
```
Expected: FAIL — `mergeUsers` is not defined.

- [ ] **Step 3: Implement `src/lib/data/users.ts`**

```ts
import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();

  const [{ data: authData }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, role, display_name, is_active"),
  ]);

  return mergeUsers(authData?.users ?? [], profiles ?? []);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/data/users.test.ts
```
Expected: PASS — 4 tests passing.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/users.ts src/lib/data/users.test.ts
git commit -m "feat: add user data layer with mergeUsers helper (TDD)"
```

---

## Task 3: User Management Server Actions (TDD)

**Files:**
- Create: `src/lib/actions/users.ts`
- Create: `src/lib/actions/users.test.ts`

- [ ] **Step 1: Write failing test for `isLastAdmin`**

Create `src/lib/actions/users.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isLastAdmin } from "./users";

const p = (id: string, role: string, is_active: boolean) => ({ id, role, is_active });

describe("isLastAdmin", () => {
  it("returns true when the excluded user is the only active admin", () => {
    expect(isLastAdmin([p("a", "admin", true)], "a")).toBe(true);
  });

  it("returns false when another active admin exists", () => {
    expect(isLastAdmin([p("a", "admin", true), p("b", "admin", true)], "a")).toBe(false);
  });

  it("returns true when other admins are inactive", () => {
    expect(isLastAdmin([p("a", "admin", true), p("b", "admin", false)], "a")).toBe(true);
  });

  it("ignores finance and teacher roles", () => {
    expect(isLastAdmin([p("a", "admin", true), p("b", "finance", true)], "a")).toBe(true);
  });

  it("returns false when excluded user is not the only admin", () => {
    expect(
      isLastAdmin([p("a", "admin", true), p("b", "admin", true), p("c", "teacher", true)], "a"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/lib/actions/users.test.ts
```
Expected: FAIL — `isLastAdmin` is not defined.

- [ ] **Step 3: Implement `src/lib/actions/users.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions/academic-years";
import { requireAdminAction } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const admin = createAdminClient();

  // Safety: if deactivating, check whether this user is an admin and the last one
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

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(input.userId);

  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/actions/users.test.ts
```
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/users.ts src/lib/actions/users.test.ts
git commit -m "feat: add user management server actions with last-admin safety check (TDD)"
```

---

## Task 4: Users Page + Panel

**Files:**
- Create: `src/app/(dashboard)/admin/users/page.tsx`
- Create: `src/app/(dashboard)/admin/users/users-panel.tsx`

- [ ] **Step 1: Create the page Server Component**

Create `src/app/(dashboard)/admin/users/page.tsx`:

```tsx
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listUsers } from "@/lib/data/users";
import { AppHeader } from "@/components/app-header";
import { UsersPanel } from "./users-panel";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const profile = await requireAdminPage();
  const users = await listUsers();

  return (
    <>
      <AppHeader title="จัดการผู้ใช้งาน" basePath="/admin/users" />
      <main className="p-4 lg:p-6">
        <UsersPanel users={users} currentUserId={profile.id} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Create the client panel component**

Create `src/app/(dashboard)/admin/users/users-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRow } from "@/lib/data/users";
import {
  createUserAction,
  updateUserAction,
  resetPasswordAction,
  toggleActiveAction,
  deleteUserAction,
} from "@/lib/actions/users";

const ROLE_LABELS: Record<UserRow["role"], string> = {
  admin: "Admin",
  finance: "Finance",
  teacher: "Teacher",
};

const ROLE_BADGE_CLASSES: Record<UserRow["role"], string> = {
  admin: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  finance: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  teacher: "bg-gray-100 text-gray-700 hover:bg-gray-100",
};

const roleItems: { value: UserRow["role"]; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "finance", label: "Finance" },
  { value: "teacher", label: "Teacher" },
];

type DialogState =
  | { type: "none" }
  | { type: "create" }
  | { type: "edit"; user: UserRow }
  | { type: "resetPassword"; user: UserRow }
  | { type: "delete"; user: UserRow };

export function UsersPanel({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [submitting, setSubmitting] = useState(false);

  // Create form
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<UserRow["role"]>("teacher");
  const [createPassword, setCreatePassword] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRow["role"]>("teacher");

  // Reset password form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function closeDialog() {
    setDialog({ type: "none" });
  }

  function openCreate() {
    setCreateEmail("");
    setCreateName("");
    setCreateRole("teacher");
    setCreatePassword("");
    setDialog({ type: "create" });
  }

  function openEdit(user: UserRow) {
    setEditName(user.displayName);
    setEditRole(user.role);
    setDialog({ type: "edit", user });
  }

  function openResetPassword(user: UserRow) {
    setNewPassword("");
    setConfirmPassword("");
    setDialog({ type: "resetPassword", user });
  }

  async function handleCreate() {
    if (!createEmail.trim() || !createPassword) return;
    setSubmitting(true);
    const result = await createUserAction({
      email: createEmail,
      displayName: createName,
      role: createRole,
      password: createPassword,
    });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("สร้างบัญชีผู้ใช้แล้ว");
    closeDialog();
    router.refresh();
  }

  async function handleEdit() {
    if (dialog.type !== "edit") return;
    setSubmitting(true);
    const result = await updateUserAction({
      userId: dialog.user.id,
      displayName: editName,
      role: editRole,
    });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("แก้ไขข้อมูลแล้ว");
    closeDialog();
    router.refresh();
  }

  async function handleResetPassword() {
    if (dialog.type !== "resetPassword") return;
    if (newPassword !== confirmPassword) {
      toast.error("รหัสผ่านไม่ตรงกัน");
      return;
    }
    if (!newPassword) return;
    setSubmitting(true);
    const result = await resetPasswordAction({
      userId: dialog.user.id,
      password: newPassword,
    });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("เปลี่ยนรหัสผ่านแล้ว");
    closeDialog();
  }

  async function handleToggleActive(user: UserRow) {
    const result = await toggleActiveAction({
      userId: user.id,
      isActive: !user.isActive,
    });
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(user.isActive ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว");
    router.refresh();
  }

  async function handleDelete() {
    if (dialog.type !== "delete") return;
    setSubmitting(true);
    const result = await deleteUserAction({ userId: dialog.user.id });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("ลบบัญชีแล้ว");
    closeDialog();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} บัญชี</p>
        <Button type="button" onClick={openCreate}>
          + เพิ่มผู้ใช้
        </Button>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>อีเมล</TableHead>
              <TableHead>บทบาท</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  ไม่พบผู้ใช้งาน
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <TableRow key={u.id} className={!u.isActive ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{u.displayName || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge className={ROLE_BADGE_CLASSES[u.role]}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                          ใช้งานได้
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-destructive border-destructive/30">
                          ปิดใช้งาน
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(u)}
                        >
                          แก้ไข
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openResetPassword(u)}
                        >
                          รหัสผ่าน
                        </Button>
                        {!isSelf && u.isActive && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => handleToggleActive(u)}
                          >
                            ปิด
                          </Button>
                        )}
                        {!isSelf && !u.isActive && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-emerald-700"
                              onClick={() => handleToggleActive(u)}
                            >
                              เปิด
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              onClick={() => setDialog({ type: "delete", user: u })}
                            >
                              ลบ
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={dialog.type === "create"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ใช้งานใหม่</DialogTitle>
            <DialogDescription>กรอกข้อมูลและรหัสผ่านชั่วคราว</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="c-email">อีเมล</Label>
              <Input
                id="c-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="teacher@school.ac.th"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">ชื่อที่แสดง</Label>
              <Input
                id="c-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="นางสาวมาลี รักดี"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>บทบาท</Label>
              <Select
                value={createRole}
                onValueChange={(v) => setCreateRole(v as UserRow["role"])}
                items={roleItems}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-password">รหัสผ่านชั่วคราว</Label>
              <Input
                id="c-password"
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">แจ้งให้ผู้ใช้เปลี่ยนหลัง login ครั้งแรก</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={submitting || !createEmail.trim() || !createPassword}
            >
              {submitting ? "กำลังสร้าง..." : "สร้างบัญชี"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={dialog.type === "edit"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลผู้ใช้</DialogTitle>
            {dialog.type === "edit" && (
              <DialogDescription>{dialog.user.email}</DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="e-name">ชื่อที่แสดง</Label>
              <Input
                id="e-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>บทบาท</Label>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as UserRow["role"])}
                items={roleItems}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={handleEdit} disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={dialog.type === "resetPassword"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตั้งรหัสผ่านใหม่</DialogTitle>
            {dialog.type === "resetPassword" && (
              <DialogDescription>{dialog.user.displayName || dialog.user.email}</DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="r-password">รหัสผ่านใหม่</Label>
              <Input
                id="r-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-confirm">ยืนยันรหัสผ่าน</Label>
              <Input
                id="r-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleResetPassword}
              disabled={submitting || !newPassword}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {submitting ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete AlertDialog ── */}
      <AlertDialog
        open={dialog.type === "delete"}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">ลบบัญชีผู้ใช้</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.type === "delete" && (
                <>
                  ต้องการลบบัญชี <strong>{dialog.user.displayName}</strong> ({dialog.user.email}){" "}
                  ออกจากระบบถาวรหรือไม่? การลบนี้ไม่สามารถกู้คืนได้
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? "กำลังลบ..." : "ลบถาวร"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors. If TypeScript complains about `Dialog` imports, verify `src/components/ui/dialog.tsx` exists (it does — check with `ls src/components/ui/dialog.tsx`).

- [ ] **Step 4: Smoke test in browser**

Start the dev server:
```bash
npm run dev
```
Navigate to `http://localhost:3000/admin/users` while logged in as admin. Verify:
- Page loads without errors
- User table appears
- "+ เพิ่มผู้ใช้" button opens create dialog
- Each row shows correct badges and buttons

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/users/
git commit -m "feat: add admin users page and panel with full CRUD dialogs"
```

---

## Task 5: Sidebar System Nav (Admin-Only)

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Read the current sidebar**

The current file is at `src/components/app-sidebar.tsx`. Key things to know:
- It has `"use client"` at the top
- It imports lucide icons: `Calendar, ChartColumn, ClipboardList, CreditCard, FileText, LayoutDashboard, Receipt, SlidersHorizontal, Users`
- `SidebarContent` is a function component (not exported) rendered inside `AppSidebar`
- It does NOT currently import or use `useAuth`

- [ ] **Step 2: Apply the changes**

Edit `src/components/app-sidebar.tsx` — make these four changes:

**Change A — Add `UserCog` to the lucide import:**
```ts
// Before:
import {
  Calendar,
  ChartColumn,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  SlidersHorizontal,
  Users,
} from "lucide-react";

// After:
import {
  Calendar,
  ChartColumn,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings2,
  SlidersHorizontal,
  Users,
} from "lucide-react";
```

**Change B — Add `useAuth` import:**
```ts
// Add after the existing imports:
import { useAuth } from "@/components/providers/auth-provider";
```

**Change C — Add `systemNav` array (after the `financeNav` array):**
```ts
const systemNav = [
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: Settings2 },
];
```

**Change D — Update `SidebarContent` to conditionally render "ระบบ" section:**
```tsx
function SidebarContent() {
  const { profile } = useAuth();

  return (
    <>
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <Image
          src="/logo.png"
          alt="โรงเรียนบัวใหญ่วิทยา"
          width={48}
          height={48}
          className="shrink-0 rounded-full object-cover"
          priority
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">
            โรงเรียนบัวใหญ่วิทยา
          </span>
          <span className="truncate text-xs leading-tight text-sidebar-accent-foreground/60">
            อ.บัวใหญ่ จ.นครราชสีมา
          </span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavSection title="ข้อมูลพื้นฐาน" items={basicNav} />
        <NavSection title="การเงิน" items={financeNav} />
        {profile?.role === "admin" && (
          <NavSection title="ระบบ" items={systemNav} />
        )}
      </nav>
    </>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Smoke test in browser**

Reload the app. Verify:
- When logged in as **admin**: "ระบบ" section appears at the bottom of the sidebar with "จัดการผู้ใช้" link
- When logged in as **finance** or **teacher**: "ระบบ" section is NOT shown
- Clicking "จัดการผู้ใช้" navigates to `/admin/users`

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass (102+ tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: add admin-only system nav section to sidebar"
```
