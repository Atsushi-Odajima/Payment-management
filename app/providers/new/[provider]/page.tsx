import { notFound } from "next/navigation";
import { getProviderDefinition } from "@/lib/providers/registry";
import { ProviderConfigView } from "@/components/views/provider-config-view";

export default function NewProviderConfigPage({
  params,
}: {
  params: { provider: string };
}) {
  const def = getProviderDefinition(params.provider);
  if (!def) notFound();

  return <ProviderConfigView providerKey={def.key} />;
}
