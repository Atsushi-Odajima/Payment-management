"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AgentForm } from "@/components/agent-form";
import { useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { EMPTY_AGENT_INPUT } from "@/lib/agents/schema";

export function AgentNewView({ nextCode }: { nextCode: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  return (
    <div>
      <PageHeader
        title={t("agentForm.titleCreate")}
        description={t("agentForm.descriptionCreate")}
        helpHref="/manual/agents"
        breadcrumbs={[{ label: t("agents.title"), href: "/agents" }, { label: t("agentForm.titleCreate") }]}
      />
      <AgentForm
        mode="create"
        agentCode={nextCode}
        initial={EMPTY_AGENT_INPUT}
        onSaved={(a) => {
          toast.show(t("agentForm.toastCreated", { code: a.agentCode }));
          router.push(`/agents/${a.id}`);
        }}
        onCancel={() => router.push("/agents")}
      />
    </div>
  );
}
