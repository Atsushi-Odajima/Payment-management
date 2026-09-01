import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { readCredentialsForDisplay } from "@/lib/providers/credentials";
import { getProviderDefinition } from "@/lib/providers/registry";
import { ProviderEditView } from "@/components/views/provider-edit-view";

export const dynamic = "force-dynamic";

export default async function EditProviderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { created?: string };
}) {
  const record = await prisma.paymentProvider.findUnique({
    where: { id: params.id },
    include: { _count: { select: { payments: true } } },
  });
  if (!record) notFound();
  const def = getProviderDefinition(record.providerKey);
  if (!def) notFound();
  // Secrets are masked here before crossing to the client.
  const view = readCredentialsForDisplay(def.key, record.credentials);

  return (
    <ProviderEditView
      record={{
        id: record.id,
        displayName: record.displayName,
        providerKey: record.providerKey,
        status: record.status,
        testMode: record.testMode,
        lastTestAt: record.lastTestAt,
        lastTestOk: record.lastTestOk,
        createdAt: record.createdAt,
        paymentsCount: record._count.payments,
      }}
      initialFields={view.fields}
      showCreatedBanner={searchParams?.created === "1"}
    />
  );
}
