import { getCurrentProfile } from "@/lib/data/context";
import {
  buildHeaderContextProps,
  loadSemesterPageContext,
} from "@/lib/data/semester-page-context";

type PageHeaderSearchParams = {
  year?: string;
  semester?: string;
};

export async function getPageHeaderProps(
  basePath: string,
  searchParams?: PageHeaderSearchParams,
) {
  const [profile, page] = await Promise.all([
    getCurrentProfile(),
    loadSemesterPageContext(searchParams?.year, searchParams?.semester),
  ]);

  const headerContext = buildHeaderContextProps(page, basePath);

  return {
    displayName: profile?.display_name ?? "ผู้ใช้",
    yearName: page.ctx?.academicYearName,
    semesterNumber: page.ctx?.semesterNumber,
    showContextSelectors: Boolean(headerContext),
    context: headerContext,
  };
}
