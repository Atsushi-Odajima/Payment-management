"use client";

import { useT } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n";
import type { WebhookStatus } from "@/lib/webhooks/status";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<WebhookStatus, string> = {
  pending: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  retrying: "bg-amber-100 text-amber-800 ring-amber-200",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
  abandoned: "bg-rose-600 text-white ring-rose-700",
};

export function WebhookStatusBadge({ status }: { status: WebhookStatus }) {
  const t = useT();
  return <span className={cn("badge", STATUS_CLASS[status])}>{t(`webhookEnums.status.${status}` as MessageKey)}</span>;
}

export function HttpStatusBadge({ status }: { status: number | null }) {
  if (status === null) return <span className="text-xs text-slate-400">—</span>;
  const ok = status >= 200 && status < 300;
  return <span className={cn("badge font-mono", ok ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-rose-100 text-rose-800 ring-rose-200")}>{status}</span>;
}
