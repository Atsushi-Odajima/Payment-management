"use client";

// Header search: debounced lookup against /api/search, grouped dropdown,
// Enter opens the full results page, Ctrl/Cmd+K focuses the box.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApiJson, useT } from "./language-provider";
import { Icon } from "./icons";
import type { SearchResult } from "@/lib/search";
import { SEARCH_MIN_LENGTH } from "@/lib/search";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

type Serialized = Omit<SearchResult, "payments"> & { payments: Array<Omit<SearchResult["payments"][number], "createdAt"> & { createdAt: string }> };

export function SearchBox({ id = "global-search" }: { id?: string }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Serialized | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Two instances exist (header / mobile); only the visible one takes the shortcut.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && inputRef.current && inputRef.current.offsetParent !== null) {
        e.preventDefault();
        inputRef.current.focus();
        inputRef.current.select();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < SEARCH_MIN_LENGTH) {
      setResult(null);
      return;
    }
    const handle = setTimeout(async () => {
      setBusy(true);
      const res = await apiJson<Serialized>(`/api/search?q=${encodeURIComponent(term)}`);
      setBusy(false);
      if (res.ok) setResult(res.data);
    }, 200);
    return () => clearTimeout(handle);
  }, [q, apiJson]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < SEARCH_MIN_LENGTH) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  const showDropdown = open && q.trim().length >= SEARCH_MIN_LENGTH;

  return (
    <form onSubmit={submit} role="search" className="relative w-full max-w-md">
      <label htmlFor={id} className="sr-only">
        {t("search.placeholder")}
      </label>
      <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        className="input py-1.5 pl-8 pr-14 text-sm"
        placeholder={t("search.placeholder")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-500 sm:block">
        {t("search.shortcut")}
      </kbd>
      {showDropdown && (
        <div id={`${id}-results`} className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {busy && !result ? (
            <p className="px-3 py-2 text-xs text-slate-500">{t("common.processing")}</p>
          ) : !result || result.total === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">{t("search.noResults")}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1 text-sm">
              <Group title={t("search.groups.payments")} count={result.payments.length}>
                {result.payments.map((p) => (
                  <Row key={p.id} href={`/${["captured", "partially_refunded", "refunded"].includes(p.status) ? "payments" : "applications"}/${p.id}`} onPick={() => setOpen(false)}>
                    <span className="font-medium text-slate-900">{p.orderNumber}</span>
                    <span className="text-xs text-slate-500">
                      {p.transferId ? `${t("transactions.transferIdValue", { id: p.transferId })} · ` : ""}
                      {p.merchantName ?? ""} · {formatYen(p.amount)} · {t(`status.${p.status}`)}
                    </span>
                  </Row>
                ))}
              </Group>
              <Group title={t("search.groups.customers")} count={result.customers.length}>
                {result.customers.map((c) => (
                  <Row key={c.id} href={`/customers/${c.id}`} onPick={() => setOpen(false)}>
                    <span className="font-medium text-slate-900">{c.name ?? c.externalId}</span>
                    <span className="text-xs text-slate-500">
                      {c.externalId} · {c.merchantName}
                      {c.email ? ` · ${c.email}` : ""}
                    </span>
                  </Row>
                ))}
              </Group>
              <Group title={t("search.groups.merchants")} count={result.merchants.length}>
                {result.merchants.map((m) => (
                  <Row key={m.id} href={`/merchants/${m.id}`} onPick={() => setOpen(false)}>
                    <span className="font-medium text-slate-900">{m.siteName}</span>
                    <span className="text-xs text-slate-500">{m.merchantCode} · {m.companyName} · {m.email}</span>
                  </Row>
                ))}
              </Group>
              <Group title={t("search.groups.agents")} count={result.agents.length}>
                {result.agents.map((a) => (
                  <Row key={a.id} href={`/agents/${a.id}`} onPick={() => setOpen(false)}>
                    <span className="font-medium text-slate-900">{a.name}</span>
                    <span className="text-xs text-slate-500">{a.agentCode} · {a.companyName}</span>
                  </Row>
                ))}
              </Group>
              <Group title={t("search.groups.settlements")} count={result.settlements.length}>
                {result.settlements.map((s) => (
                  <Row key={s.id} href={`/settlements/${s.id}`} onPick={() => setOpen(false)}>
                    <span className="font-mono font-medium text-slate-900">{s.invoiceNo}</span>
                    <span className="text-xs text-slate-500">
                      {s.merchantCode} {s.merchantName} · {formatYen(s.netAmount)} · {t(`settlementEnums.status.${s.status}` as MessageKey)}
                    </span>
                  </Row>
                ))}
              </Group>
              <Group title={t("search.groups.admins")} count={result.admins.length}>
                {result.admins.map((a) => (
                  <Row key={a.id} href={`/admins/${a.id}`} onPick={() => setOpen(false)}>
                    <span className="font-medium text-slate-900">{a.name}</span>
                    <span className="text-xs text-slate-500">{a.loginId} · {a.email}</span>
                  </Row>
                ))}
              </Group>
              <Link href={`/search?q=${encodeURIComponent(q.trim())}`} className="block border-t border-slate-100 px-3 py-2 text-xs font-medium text-brand-700 hover:bg-slate-50" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>
                {t("search.viewAll")}
              </Link>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <p className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function Row({ href, onPick, children }: { href: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex flex-col px-3 py-1.5 hover:bg-slate-50" onMouseDown={(e) => e.preventDefault()} onClick={onPick}>
      {children}
    </Link>
  );
}
