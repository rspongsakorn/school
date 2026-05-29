import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listUsers } from "@/lib/data/users";
import { AppHeader } from "@/components/app-header";
import { UsersPanel } from "./users-panel";

export const dynamic = "force-dynamic";

async function UsersPanelLoader({ currentUserId }: { currentUserId: string }) {
  const users = await listUsers();
  return <UsersPanel users={users} currentUserId={currentUserId} />;
}

function UsersPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-9 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-lg border border-border">
        <div className="space-y-0 divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-44 animate-pulse rounded bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              <div className="ml-auto flex gap-2">
                <div className="h-8 w-14 animate-pulse rounded bg-muted" />
                <div className="h-8 w-20 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function UsersPage() {
  const profile = await requireAdminPage();

  return (
    <>
      <AppHeader title="จัดการผู้ใช้งาน" basePath="/admin/users" />
      <main className="p-4 lg:p-6">
        <Suspense fallback={<UsersPanelSkeleton />}>
          <UsersPanelLoader currentUserId={profile.id} />
        </Suspense>
      </main>
    </>
  );
}
