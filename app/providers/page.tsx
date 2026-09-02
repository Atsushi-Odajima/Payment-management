import { prisma } from "@/lib/db";
import { ProvidersView } from "@/components/views/providers-view";
import { toProviderStatus } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  // NOTE: select only display fields — never pass credentials to the client.
  const providers = await prisma.paymentProvider.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayName: true,
      providerKey: true,
      category: true,
      testMode: true,
      status: true,
      lastTestAt: true,
      lastTestOk: true,
    },
  });

  return (
    <ProvidersView
      providers={providers.map((p) => ({ ...p, status: toProviderStatus(p.status) }))}
    />
  );
}
