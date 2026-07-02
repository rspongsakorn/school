import { requireFinancePage } from "@/lib/auth/require-finance";
import { RegistrationPanel } from "@/components/registration/registration-panel";

export default async function RegistrationPage() {
  await requireFinancePage();
  return <RegistrationPanel />;
}
