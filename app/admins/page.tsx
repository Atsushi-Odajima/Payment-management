import { prisma } from "@/lib/db";
import { AdminsView } from "@/components/views/admins-view";
import { requireMasterPage } from "@/lib/admin/page-guard";
import { ADMIN_SELECT, toAdminView } from "@/lib/admin/select";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { parseSort } from "@/lib/query";

export const dynamic = "force-dynamic";

const SORT_KEYS = ["loginId", "name", "lastLoginAt", "createdAt"] as const;

export default async function AdminsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  await requireMasterPage();
  const page = parsePage(searchParams?.page);
  const sort = parseSort(searchParams, SORT_KEYS, { key: "loginId", dir: "asc" });
  const [rows, total] = await Promise.all([
    prisma.adminUser.findMany({
      orderBy: { [sort.key]: sort.dir },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
      select: ADMIN_SELECT,
    }),
    prisma.adminUser.count(),
  ]);
  return (
    <AdminsView
      admins={rows.map(toAdminView)}
      total={total}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      sort={sort}
      params={{ sort: searchParams?.sort, dir: searchParams?.dir }}
    />
  );
}
