import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AnnouncementFormView } from "@/components/views/announcement-form-view";
import { requireAdminPage } from "@/lib/admin/page-guard";
import { loadAnnouncement } from "@/lib/announcements/list";

export const dynamic = "force-dynamic";

export default async function AnnouncementEditPage({ params }: { params: { id: string } }) {
  await requireAdminPage();
  const announcement = await loadAnnouncement(params.id);
  if (!announcement) notFound();
  const merchants = await prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } });
  return <AnnouncementFormView merchants={merchants} initial={announcement} />;
}
