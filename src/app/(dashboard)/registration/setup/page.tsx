import { redirect } from "next/navigation";

type SearchParams = Promise<{ year?: string; grade?: string; classroom?: string }>;

export default async function RegistrationSetupRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.year) params.set("year", sp.year);
  if (sp.grade) params.set("grade", sp.grade);
  if (sp.classroom) params.set("classroom", sp.classroom);
  const query = params.toString();
  redirect(query ? `/registration?${query}` : "/registration");
}
