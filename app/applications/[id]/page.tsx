import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ApplicationDetailView } from "@/components/views/application-detail-view";
import { APPLICATION_SELECT } from "@/app/api/applications/select";
import { toApplicationView } from "@/lib/applications/serialize";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({ params }: { params: { id: string } }) {
  const row = await prisma.paymentApplication.findUnique({ where: { id: params.id }, select: APPLICATION_SELECT });
  if (!row) notFound();
  return <ApplicationDetailView application={toApplicationView(row)} />;
}
