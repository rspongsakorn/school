# User Management Page — Design Spec

## Goal

Add a `/admin/users` page (admin-only) that lets administrators list all system users, create new accounts with a temporary password, edit display name and role, reset passwords directly, toggle active/inactive status, and permanently delete accounts.

## Architecture

Server Component page inside the dashboard layout, guarded by `requireAdminPage()`. All mutations are Next.js Server Actions using a Supabase Admin client (service role key). User list is fetched by merging `supabase.auth.admin.listUsers()` (email, created_at) with the `profiles` table (role, display_name, is_active). A new "ระบบ" section is added to the sidebar, visible only when the current user has the `admin` role.

## Data Flow

```
auth.users (id, email, created_at)
  ↓ merged by id
profiles (id, role, display_name, is_active)
  → UserRow { id, email, displayName, role, isActive, createdAt }
```

### Create user
`supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name, role, is_active: true } })`

The existing trigger `on_auth_user_created` reads `user_metadata` and auto-inserts the `profiles` row — no manual insert needed.

### Edit user (role / display_name)
`UPDATE profiles SET role = $role, display_name = $displayName WHERE id = $id`

### Reset password
`supabase.auth.admin.updateUserById(id, { password: newPassword })`

### Toggle active
`UPDATE profiles SET is_active = $isActive WHERE id = $id`

### Delete user
`supabase.auth.admin.deleteUser(id)` — cascades to `profiles` via FK.

## Safety Rules

- **Cannot act on self**: deactivate, delete buttons are hidden when `p.id === currentUserId`
- **Last admin protection**: before deactivating or changing role away from admin, verify `profiles` has ≥ 2 active admins; reject with error if not
- **Confirm before delete**: AlertDialog with user's name + email; requires explicit button press

## Files

### Create: `src/lib/supabase/admin.ts`

Supabase admin client using service role key. Never imported from client components.

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

### Create: `src/lib/data/users.ts`

```ts
export type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "finance" | "teacher";
  isActive: boolean;
  createdAt: string;
};

export async function listUsers(): Promise<UserRow[]>
```

Uses `createAdminClient()` to fetch both `auth.admin.listUsers()` (email, created_at) and `profiles` (role, display_name, is_active) in parallel, merges by `id`. Users with no matching profile row are excluded. The admin client bypasses RLS, so no separate auth check is needed inside this function — the calling page already enforces admin-only access.

### Create: `src/lib/actions/users.ts`

All actions call `requireAdminAction()` first.

| Function | Parameters | Returns |
|----------|------------|---------|
| `createUserAction` | `{ email, displayName, role, password }` | `ActionState` |
| `updateUserAction` | `{ userId, displayName, role }` | `ActionState` |
| `resetPasswordAction` | `{ userId, password }` | `ActionState` |
| `toggleActiveAction` | `{ userId, isActive }` | `ActionState` |
| `deleteUserAction` | `{ userId }` | `ActionState` |

`ActionState = { ok: true } | { ok: false; error: string }`

`toggleActiveAction` and `updateUserAction` enforce the last-admin safety check server-side when applicable.

### Create: `src/app/(dashboard)/admin/users/page.tsx`

Server Component. Calls `requireAdminPage()`, then `listUsers()`. Passes data + `currentUserId` to `<UsersPanel>`.

### Create: `src/app/(dashboard)/admin/users/users-panel.tsx`

`"use client"` component. Renders:

- **Table** — columns: ชื่อ, อีเมล, บทบาท badge, สถานะ badge, actions
- **Create dialog** — fields: email, displayName, role (select), password (text input)
- **Edit dialog** — fields: displayName, role
- **Reset password dialog** — fields: password, confirmPassword (validated client-side before submitting)
- **Delete AlertDialog** — shows name + email, red confirm button

Role badges: Admin = blue, Finance = amber, Teacher = gray
Status badges: ใช้งานได้ = green, ปิดใช้งาน = red

Action buttons per row:
- **แก้ไข** — always shown
- **รหัสผ่าน** — always shown
- **ปิด / เปิด** — shown only when `p.id !== currentUserId`
- **ลบ** — shown only when `p.id !== currentUserId` AND `p.isActive === false`

### Modify: `src/components/app-sidebar.tsx`

Add a `systemNav` array and a new "ระบบ" `NavSection` rendered only when `profile?.role === "admin"`.

```ts
const systemNav = [
  { href: "/admin/users", label: "จัดการผู้ใช้", icon: UserCog },
];
```

The sidebar currently reads `profile` from `useAuth()` — use that to conditionally render the section.

## Environment Variables

```
# .env.local (server-only — never prefix with NEXT_PUBLIC_)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Must also be set in production deployment environment.

## Error States

- Invalid email / weak password → surface Supabase error message in toast
- Last active admin → `"ไม่สามารถดำเนินการได้ เนื่องจากต้องมี admin ที่ใช้งานได้อย่างน้อย 1 คน"`
- Delete while active → blocked at UI level (delete button only shows for inactive users)
- Network error → generic `"เกิดข้อผิดพลาด กรุณาลองใหม่"` toast

## Out of Scope

- Self-service password reset ("ลืมรหัสผ่าน" email flow)
- Profile photo / avatar
- Audit log of user management actions
- Bulk import of users
