import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AnnouncementDetailView } from "@/components/views/announcement-detail-view";
import { loadAnnouncement } from "@/lib/announcements/list";

export const dynamic = "force-dynamic";

export default async function AnnouncementDetailPage({ params }: { params: { id: string } }) {
  const announcement = await loadAnnouncement(params.id);
  if (!announcement) notFound();
  const merchants = announcement.targetMerchantIds.length
    ? await prisma.merchant.findMany({ where: { id: { in: announcement.targetMerchantIds } }, select: { id: true, merchantCode: true, siteName: true } })
    : [];
  const merchantNames = Object.fromEntries(merchants.map((m) => [m.id, `${m.merchantCode} ${m.siteName}`]));
  return <AnnouncementDetailView announcement={announcement} merchantNames={merchantNames} />;
}
