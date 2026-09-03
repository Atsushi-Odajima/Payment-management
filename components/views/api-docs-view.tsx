"use client";

// Public API documentation (Phase L-3): chapter navigation, the rendered
// hand-written chapter, and the endpoint reference generated from the
// OpenAPI document. No admin chrome (public page).

import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { WirePayIcon } from "@/components/wire-pay-icon";
import { useT } from "@/components/language-provider";
import { API_DOC_CHAPTERS, type ApiDocChapter } from "@/lib/api-docs/chapters";
import type { Heading } from "@/lib/manual/markdown";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface FieldView {
  name: string;
  type: string;
  required: boolean;
  description: string;
  children?: FieldView[];
}

export interface EndpointView {
  operationId: string;
  method: "get" | "post";
  path: string;
  summary: string;
  description: string;
  status: number;
  headers: Array<{ name: string; description: string }>;
  pathParams: Array<{ name: string; description: string }>;
  query: FieldView[];
  request: FieldView[];
  responseExample: string;
}

export function ApiDocsView({ chapter, headings, endpoints, errorCodes, testCards, baseUrl, rateLimit, children }: { chapter: ApiDocChapter; headings: Heading[]; endpoints: EndpointView[]; errorCodes: ReadonlyArray<{ code: string; status: number; description: string }>; testCards: Array<{ number: string; outcome: string; description: string }>; baseUrl: string; rateLimit: number; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <Link href="/docs/api" className="flex items-center gap-2" aria-label="Wire Pay API">
          <WirePayIcon className="h-7 w-7 shrink-0 rounded-md shadow-sm" />
          <span className="text-sm font-semibold text-slate-900">Wire Pay API</span>
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/merchant/sandbox" className="btn-secondary hidden px-3 py-1.5 sm:inline-flex">
            {t("apiDocs.sandboxLink")}
          </Link>
          <Link href="/merchant/login" className="btn-secondary px-3 py-1.5">
            {t("apiDocs.portalLink")}
          </Link>
          <LanguageToggle />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <h1 className="text-2xl font-bold text-slate-900">{t("apiDocs.title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("apiDocs.description")}</p>
        <p className="mt-2 text-xs text-slate-500">
          {t("apiDocs.baseUrl")}: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{baseUrl}</code> ·{" "}
          <a href="/api/v1/openapi.json" className="text-brand-700 hover:underline">
            {t("apiDocs.openapi")}
          </a>
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
          <nav className="card self-start p-3 lg:sticky lg:top-6" aria-label={t("apiDocs.guides")}>
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("apiDocs.guides")}</p>
            <ol className="space-y-0.5">
              {API_DOC_CHAPTERS.map((c) => (
                <li key={c}>
                  <Link href={`/docs/api/${c}`} aria-current={c === chapter ? "page" : undefined} className={cn("block rounded-md px-2 py-1.5 text-sm", c === chapter ? "bg-brand-50 font-medium text-brand-800" : "text-slate-700 hover:bg-slate-100")}>
                    {t(`apiDocs.chapters.${c}` as MessageKey)}
                  </Link>
                </li>
              ))}
            </ol>
            <p className="mt-4 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("apiDocs.reference")}</p>
            <ol className="space-y-0.5">
              {endpoints.map((e) => (
                <li key={e.operationId}>
                  <a href={`#${e.operationId}`} className="block rounded-md px-2 py-1.5 font-mono text-xs text-slate-700 hover:bg-slate-100">
                    <span className={cn("mr-1 inline-block w-10 text-[10px] font-semibold uppercase", e.method === "post" ? "text-emerald-700" : "text-sky-700")}>{e.method}</span>
                    {e.path}
                  </a>
                </li>
              ))}
            </ol>
            {headings.length > 0 && (
              <>
                <p className="mt-4 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(`apiDocs.chapters.${chapter}` as MessageKey)}</p>
                <ol className="space-y-0.5">
                  {headings.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} className="block truncate rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </nav>
          <div className="min-w-0 space-y-8">
            <article className="card prose prose-slate max-w-none p-6 text-sm">{children}</article>
            {chapter === "errors" && (
              <section className="card p-6">
                <h2 className="text-lg font-semibold text-slate-900">{t("apiDocs.errorCodes")}</h2>
                <p className="mt-1 text-xs text-slate-500">{t("apiDocs.rateLimit", { limit: rateLimit })}</p>
                <table className="mt-3 w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-1 pr-4">{t("apiDocs.thCode")}</th>
                      <th className="py-1 pr-4">{t("apiDocs.thStatus")}</th>
                      <th className="py-1">{t("apiDocs.thDescription")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {errorCodes.map((e) => (
                      <tr key={e.code}>
                        <td className="py-1.5 pr-4 font-mono text-xs">{e.code}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{e.status}</td>
                        <td className="py-1.5 text-slate-700">{e.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {chapter === "test-cards" && (
              <section className="card p-6">
                <h2 className="text-lg font-semibold text-slate-900">{t("apiDocs.testCards")}</h2>
                <table className="mt-3 w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-1 pr-4">{t("apiDocs.thNumber")}</th>
                      <th className="py-1 pr-4">{t("apiDocs.thOutcome")}</th>
                      <th className="py-1">{t("apiDocs.thDescription")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {testCards.map((c) => (
                      <tr key={c.number}>
                        <td className="py-1.5 pr-4 font-mono text-xs">{c.number}</td>
                        <td className="py-1.5 pr-4 font-mono text-xs">{c.outcome}</td>
                        <td className="py-1.5 text-slate-700">{c.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            <section className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-900">{t("apiDocs.reference")}</h2>
              {endpoints.map((e) => (
                <article key={e.operationId} id={e.operationId} className="card p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("badge font-mono uppercase", e.method === "post" ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-sky-100 text-sky-800 ring-sky-200")}>{e.method}</span>
                    <code className="font-mono text-sm text-slate-900">{e.path}</code>
                    <span className="text-sm text-slate-600">— {e.summary}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{e.description}</p>
                  {e.headers.length > 0 && <FieldTable title={t("apiDocs.headers")} rows={e.headers.map((h) => ({ name: h.name, type: "string", required: false, description: h.description }))} />}
                  {e.pathParams.length > 0 && <FieldTable title={t("apiDocs.pathParams")} rows={e.pathParams.map((p) => ({ name: p.name, type: "string", required: true, description: p.description }))} />}
                  {e.query.length > 0 && <FieldTable title={t("apiDocs.query")} rows={e.query} />}
                  {e.request.length > 0 && <FieldTable title={t("apiDocs.request")} rows={e.request} />}
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("apiDocs.responseExample", { status: e.status })}</p>
                  <pre className="mt-1 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{e.responseExample}</pre>
                </article>
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldTable({ title, rows }: { title: string; rows: FieldView[] }) {
  const t = useT();
  const flat: Array<FieldView & { depth: number }> = [];
  const walk = (list: FieldView[], depth: number) => {
    for (const f of list) {
      flat.push({ ...f, depth });
      if (f.children) walk(f.children, depth + 1);
    }
  };
  walk(rows, 0);
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <table className="mt-1 w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 pr-4">{t("apiDocs.field")}</th>
            <th className="py-1 pr-4">{t("apiDocs.type")}</th>
            <th className="py-1 pr-4">{t("apiDocs.required")}</th>
            <th className="py-1">{t("apiDocs.fieldDescription")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {flat.map((f) => (
            <tr key={`${f.depth}-${f.name}`}>
              <td className="py-1.5 pr-4 font-mono text-xs" style={{ paddingLeft: f.depth * 16 }}>
                {f.depth > 0 ? "└ " : ""}
                {f.name}
              </td>
              <td className="py-1.5 pr-4 font-mono text-xs text-slate-600">{f.type}</td>
              <td className="py-1.5 pr-4 text-xs">{f.required ? <span className="text-rose-700">{t("apiDocs.yes")}</span> : <span className="text-slate-400">{t("apiDocs.no")}</span>}</td>
              <td className="py-1.5 text-xs text-slate-700">{f.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
