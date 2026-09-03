import { PlanFormView } from "@/components/views/plan-form-view";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/page-guard";

export const dynamic = "force-dynamic";

export default async function PlanNewPage() {
  await requireAdminPage();
  const merchants = await prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } });
  return <PlanFormView merchants={merchants} />;
}
