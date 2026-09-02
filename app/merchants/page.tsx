import { prisma } from "@/lib/db";
import { MerchantsView } from "@/components/views/merchants-view";
import { isEmailNotification } from "@/lib/merchants/types";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function MerchantsPage({ searchParams }: { searchParams?: { page?: string } }) {
  const page = parsePage(searchParams?.page);
  // Never select passwordEnc here.
  const [merchants, total] = await Promise.all([
   prisma.merchant.findMany({
    orderBy: { merchantCode: "asc" },
    skip: (page - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE,
    select: {
      agent: { select: { name: true } },
      id: true,
      merchantCode: true,
      siteName: true,
      companyName: true,
      contactName: true,
      emailNotification: true,
      createdAt: true,
    },
   }),
   prisma.merchant.count(),
  ]);

  return (
    <MerchantsView
      merchants={merchants.map((m) => ({
        ...m,
        emailNotification: isEmailNotification(m.emailNotification) ? m.emailNotification : "none",
        agentName: m.agent?.name ?? null,
      }))}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      total={total}
    />
  );
}
