import { prisma } from "@/lib/db";
import { ApplicationsView } from "@/components/views/applications-view";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/components/pagination";
import { APPLICATION_SELECT } from "@/app/api/applications/select";
import { toApplicationView } from "@/lib/applications/serialize";
import { isApplicationStatus } from "@/lib/applications/types";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams?: { status?: string; merchant?: string; page?: string };
}) {
  const status = isApplicationStatus(searchParams?.status) ? searchParams!.status! : "";
  const merchantId = searchParams?.merchant ?? "";
  const page = parsePage(searchParams?.page);
  const where = {
    ...(status ? { status } : {}),
    ...(merchantId ? { merchantId } : {}),
  };

  const [rows, total, merchants] = await Promise.all([
    // Pending first, then newest. SQLite/Postgres both sort strings, so use a
    // two-step order: fetch the page ordered by (status != pending, appliedAt desc)
    // via raw ordering isn't portable — sort in JS on the page window instead.
    prisma.paymentApplication.findMany({
      where,
      orderBy: [{ appliedAt: "desc" }],
      select: APPLICATION_SELECT,
    }),
    prisma.paymentApplication.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
  ]);

  const sorted = rows
    .map(toApplicationView)
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  const pageRows = sorted.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE);

  return (
    <ApplicationsView
      applications={pageRows}
      merchants={merchants}
      status={status}
      merchantId={merchantId}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      total={total}
    />
  );
}
