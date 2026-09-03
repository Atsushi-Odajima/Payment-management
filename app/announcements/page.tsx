import { AnnouncementsView } from "@/components/views/announcements-view";
import { loadAnnouncements, parseAnnouncementFilters, parseAnnouncementSort } from "@/lib/announcements/list";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const page = parsePage(searchParams?.page);
  const filters = parseAnnouncementFilters(searchParams);
  const sort = parseAnnouncementSort(searchParams);
  const { rows, total } = await loadAnnouncements({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <AnnouncementsView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} />;
}
