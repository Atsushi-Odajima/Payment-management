"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { RoleBadge } from "@/components/admin-badges";
import { normalizeRole } from "@/lib/role";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { methodLabel } from "@/components/views/transactions-view";
import { SALES_STATUSES } from "@/lib/payments/transitions";
import type { SearchResult } from "@/lib/search";
import { formatYen } from "@/lib/utils";

export function SearchView({ result }: { result: SearchResult }) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const q = result.q;

  return (
    <div>
      <PageHeader title={t("search.title")} description={q ? t("search.results", { q, count: result.total }) : t("search.description")} />
      {result.total === 0 ? (
        <p className="card px-6 py-12 text-center text-sm text-slate-500">{q.length < 2 ? t("search.minLength") : t("search.noResults")}</p>
      ) : (
        <div className="space-y-6">
          <Group title={t("search.groups.payments")} count={result.payments.length}>
            {result.payments.map((p) => (
              <Item key={p.id} href={`/${SALES_STATUSES.includes(p.status) ? "payments" : "applications"}/${p.id}`}>
                <div>
                  <p className="font-medium text-slate-900">{p.orderNumber}</p>
                  <p className="text-xs text-slate-500">
                    {p.transferId ? `${t("transactions.transferIdValue", { id: p.transferId })} · ` : ""}
                    {p.merchantName ?? "—"} · {methodLabel(p.method, lang)} · {p.customerName ?? "—"} · {formatDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-semibold">{formatYen(p.amount)}</span>
                  <PaymentStatusBadge status={p.status} />
                </div>
              </Item>
            ))}
          </Group>
          <Group title={t("search.groups.customers")} count={result.customers.length}>
            {result.customers.map((c) => (
              <Item key={c.id} href={`/customers/${c.id}`}>
                <div>
                  <p className="font-medium text-slate-900">{c.name ?? c.externalId}</p>
                  <p className="text-xs text-slate-500">
                    {c.externalId} · {c.merchantName}
                    {c.email ? ` · ${c.email}` : ""}
                  </p>
                </div>
                {c.anonymized && <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{t("customers.anonymizedBadge")}</span>}
              </Item>
            ))}
          </Group>
          <Group title={t("search.groups.merchants")} count={result.merchants.length}>
            {result.merchants.map((m) => (
              <Item key={m.id} href={`/merchants/${m.id}`}>
                <div>
                  <p className="font-medium text-slate-900">{m.siteName}</p>
                  <p className="text-xs text-slate-500">{m.merchantCode} · {m.companyName} · {m.email}</p>
                </div>
              </Item>
            ))}
          </Group>
          <Group title={t("search.groups.agents")} count={result.agents.length}>
            {result.agents.map((a) => (
              <Item key={a.id} href={`/agents/${a.id}`}>
                <div>
                  <p className="font-medium text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.agentCode} · {a.companyName} · {a.email}</p>
                </div>
              </Item>
            ))}
          </Group>
          <Group title={t("search.groups.admins")} count={result.admins.length}>
            {result.admins.map((a) => (
              <Item key={a.id} href={`/admins/${a.id}`}>
                <div>
                  <p className="font-medium text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.loginId} · {a.email}</p>
                </div>
                <RoleBadge role={normalizeRole(a.role)} />
              </Item>
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
        {title} <span className="ml-1 text-xs font-normal text-slate-500">{count}</span>
      </h2>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </section>
  );
}

function Item({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-slate-50">
        {children}
      </Link>
    </li>
  );
}
