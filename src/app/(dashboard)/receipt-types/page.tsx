import { AppHeader } from "@/components/app-header";
import { ReceiptTypesPanel } from "@/components/finance/receipt-types-panel";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listReceiptTypes } from "@/lib/data/receipt-types";

export default async function ReceiptTypesPage() {
  const profile = await requireAdminPage();
  const types = await listReceiptTypes();

  return (
    <>
      <AppHeader
        title="ประเภทใบเสร็จ"
        displayName={profile.display_name ?? "ผู้ใช้"}
        showContextSelectors={false}
      />
      <main className="p-6">
        <ReceiptTypesPanel types={types} />
      </main>
    </>
  );
}
