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
