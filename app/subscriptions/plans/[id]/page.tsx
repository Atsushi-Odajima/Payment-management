import { notFound } from "next/navigation";
import { PlanFormView } from "@/components/views/plan-form-view";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/page-guard";
import { loadPlan } from "@/lib/subscriptions/list";

export const dynamic = "force-dynamic";

export default async function PlanEditPage({ params }: { params: { id: string } }) {
  await requireAdminPage();
  const [plan, merchants] = await Promise.all([loadPlan(params.id), prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } })]);
  if (!plan) notFound();
  return <PlanFormView merchants={merchants} initial={plan} />;
}
