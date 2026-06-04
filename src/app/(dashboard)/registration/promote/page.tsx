import { requireAdminPage } from "@/lib/auth/require-admin";
import { PromotePanel } from "@/components/registration/promote-panel";

export default async function PromotePage() {
  await requireAdminPage();
  return <PromotePanel />;
}
