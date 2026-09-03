import { SearchView } from "@/components/views/search-view";
import { currentAdminFromCookies } from "@/lib/admin/page-guard";
import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams?: { q?: string } }) {
  const admin = await currentAdminFromCookies();
  const result = await searchAll(searchParams?.q ?? "", { limit: 20, includeAdmins: admin?.role === "master" });
  return <SearchView result={result} />;
}
