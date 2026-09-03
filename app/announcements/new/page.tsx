import { prisma } from "@/lib/db";
import { AnnouncementFormView } from "@/components/views/announcement-form-view";
import { requireAdminPage } from "@/lib/admin/page-guard";

export const dynamic = "force-dynamic";

export default async function AnnouncementNewPage() {
  await requireAdminPage();
  const merchants = await prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } });
  return <AnnouncementFormView merchants={merchants} />;
}
