"use client";

// Header bell (Phase J): unread badge, a dropdown with the latest ten
// notifications and a link to the full list. Polls every 60 s while the tab
// is visible; marks a notification read when its row is clicked.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useSession } from "@/components/session-provider";
import type { NotificationRow, NotificationSeverity } from "@/lib/notifications/types";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const SEVERITY_CLASS: Record<NotificationSeverity, string> = {
  info: "bg-sky-100 text-sky-800 ring-sky-200",
  warning: "bg-amber-100 text-amber-800 ring-amber-200",
  critical: "bg-rose-100 text-rose-800 ring-rose-200",
};

export function SeverityBadge({ severity }: { severity: NotificationSeverity }) {
  const t = useT();
  return <span className={cn("badge", SEVERITY_CLASS[severity])}>{t(`notificationEnums.severity.${severity}` as MessageKey)}</span>;
}

type Wire = Omit<NotificationRow, "createdAt" | "readAt"> & { createdAt: string; readAt: string | null };

export function NotificationBell() {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const formatDate = useFormatDateTime();
  const { isAuthenticated } = useSession();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Wire[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await apiJson<{ unread: number; notifications: Wire[] }>("/api/notifications/unread");
    if (res.ok) {
      setUnread(res.data.unread);
      setItems(res.data.notifications);
    }
  }, [apiJson]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => clearInterval(timer);
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!isAuthenticated) return null;

  async function openItem(n: Wire) {
    setOpen(false);
    if (!n.readAt) {
      const res = await apiJson<{ unread: number }>(`/api/notifications/${n.id}/read`, { method: "POST" });
      if (res.ok) setUnread(res.data.unread);
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    }
    if (n.href) router.push(n.href);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        aria-label={t("notifications.bell", { count: unread })}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white" data-testid="unread-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" aria-label={t("notifications.title")} className="absolute right-0 z-30 mt-2 w-[360px] max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="text-sm font-semibold text-slate-800">{t("notifications.title")}</span>
            <span className="text-xs text-slate-500">{t("notifications.unreadCount", { count: unread })}</span>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">{t("notifications.empty")}</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" role="menuitem" className={cn("flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50", !n.readAt && "bg-brand-50/50")} onClick={() => openItem(n)}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <SeverityBadge severity={n.severity} />
                        <span className="truncate font-medium text-slate-900">{n.title}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{formatDate(new Date(n.createdAt))}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs">
            <Link href="/notifications/settings" className="text-slate-500 hover:underline" onClick={() => setOpen(false)}>
              {t("notifications.settingsLink")}
            </Link>
            <Link href="/notifications" className="font-medium text-brand-700 hover:underline" onClick={() => setOpen(false)}>
              {t("notifications.viewAll")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
