import { prisma } from "@/lib/db";
import { BlacklistView } from "@/components/views/blacklist-view";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadBlacklist, parseBlacklistFilters, parseBlacklistSort } from "@/lib/risk/blacklist";
import { loadRiskSettings } from "@/lib/risk/service";

export const dynamic = "force-dynamic";

export default async function BlacklistPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const page = parsePage(searchParams?.page);
  const filters = parseBlacklistFilters(searchParams);
  const sort = parseBlacklistSort(searchParams);
  const [{ rows, total, candidateCount }, settings] = await Promise.all([loadBlacklist({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE }), loadRiskSettings(prisma)]);
  return <BlacklistView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} candidateCount={candidateCount} settings={settings} />;
}
