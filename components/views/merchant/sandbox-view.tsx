"use client";

// Sandbox console (Phase L-3): the browser calls the real public API
// (/api/v1) with a test key the merchant pastes; the key lives in
// sessionStorage only. Live keys are refused client-side and server-side
// (test cards are refused in live mode anyway).

import { useEffect, useState } from "react";
import { useLang, useT } from "@/components/language-provider";
import { PUBLIC_API_BASE_PATH } from "@/lib/public-api/openapi";

export interface SandboxEndpoint {
  operationId: string;
  method: "get" | "post";
  path: string;
  summary: { ja: string; en: string };
  hasBody: boolean;
  pathParams: string[];
  example: Record<string, unknown> | null;
}

const STORAGE_KEY = "wirepay.sandbox.key";

export function MerchantSandboxView({ endpoints, testCards }: { endpoints: SandboxEndpoint[]; testCards: Array<{ number: string; description: { ja: string; en: string } }> }) {
  const t = useT();
  const { lang } = useLang();
  const [apiKey, setApiKey] = useState("");
  const [op, setOp] = useState(endpoints[0]?.operationId ?? "");
  const [params, setParams] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: number; ms: number; text: string } | null>(null);
  // Origin is only known in the browser; read it after hydration so server and client markup match.
  const [origin, setOrigin] = useState("");
  const endpoint = endpoints.find((e) => e.operationId === op) ?? endpoints[0];

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setApiKey(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    if (endpoint?.example) setBody(JSON.stringify(endpoint.example, null, 2));
    else setBody("");
  }, [endpoint]);

  function resolvedPath(): string {
    let p = endpoint.path;
    for (const name of endpoint.pathParams) p = p.replace(`{${name}}`, encodeURIComponent(params[name] ?? ""));
    return `${PUBLIC_API_BASE_PATH}${p}${query ? `?${query.replace(/^\?/, "")}` : ""}`;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!/^wp_test_ak_/.test(apiKey.trim())) {
      setError(t("merchantPortal.sandbox.liveKeyRefused"));
      return;
    }
    let payload: string | undefined;
    if (endpoint.hasBody) {
      try {
        payload = JSON.stringify(JSON.parse(body || "{}"));
      } catch {
        setError(t("merchantPortal.sandbox.invalidJson"));
        return;
      }
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, apiKey.trim());
    } catch {
      /* ignore */
    }
    setBusy(true);
    const started = performance.now();
    try {
      const res = await fetch(resolvedPath(), { method: endpoint.method.toUpperCase(), headers: { authorization: `Bearer ${apiKey.trim()}`, ...(payload ? { "content-type": "application/json" } : {}) }, body: payload });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* keep raw */
      }
      setResult({ status: res.status, ms: Math.round(performance.now() - started), text: pretty });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const curl = `curl -X ${endpoint.method.toUpperCase()} '${origin}${resolvedPath()}' \\\n  -H 'Authorization: Bearer ${apiKey ? apiKey.slice(0, 16) + "…" : "wp_test_ak_…"}'${endpoint.hasBody ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${body.replace(/\n\s*/g, " ")}'` : ""}`;

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.sandbox.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.sandbox.description")}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <form onSubmit={send} className="card space-y-4 p-5" aria-busy={busy}>
          <div>
            <label htmlFor="sb-key" className="label">
              {t("merchantPortal.sandbox.apiKey")}
            </label>
            <input id="sb-key" className="input font-mono text-xs" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="wp_test_ak_..." autoComplete="off" spellCheck={false} />
            <p className="help">{t("merchantPortal.sandbox.apiKeyHelp")}</p>
          </div>
          <div>
            <label htmlFor="sb-endpoint" className="label">
              {t("merchantPortal.sandbox.endpoint")}
            </label>
            <select id="sb-endpoint" className="input font-mono text-xs" value={endpoint.operationId} onChange={(e) => setOp(e.target.value)}>
              {endpoints.map((e) => (
                <option key={e.operationId} value={e.operationId}>
                  {e.method.toUpperCase()} {e.path} — {e.summary[lang]}
                </option>
              ))}
            </select>
          </div>
          {endpoint.pathParams.map((name) => (
            <div key={name}>
              <label htmlFor={`sb-param-${name}`} className="label">
                {t("merchantPortal.sandbox.pathParam", { name })}
              </label>
              <input id={`sb-param-${name}`} className="input font-mono text-xs" value={params[name] ?? ""} onChange={(e) => setParams((p) => ({ ...p, [name]: e.target.value }))} />
            </div>
          ))}
          {endpoint.method === "get" && !endpoint.pathParams.length && (
            <div>
              <label htmlFor="sb-query" className="label">
                {t("merchantPortal.sandbox.query")}
              </label>
              <input id="sb-query" className="input font-mono text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="limit=5&status=captured" />
            </div>
          )}
          {endpoint.hasBody && (
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="sb-body" className="label">
                  {t("merchantPortal.sandbox.body")}
                </label>
                <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setBody(JSON.stringify(endpoint.example ?? {}, null, 2))}>
                  {t("merchantPortal.sandbox.loadExample")}
                </button>
              </div>
              <textarea id="sb-body" className="input min-h-[200px] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busy || !apiKey}>
            {busy ? t("merchantPortal.sandbox.sending") : t("merchantPortal.sandbox.send")}
          </button>
        </form>
        <div className="space-y-4">
          <section className="card p-5">
            <p className="text-sm font-semibold text-slate-800">{t("merchantPortal.sandbox.response")}</p>
            {result ? (
              <>
                <p className={`mt-1 text-xs ${result.status < 400 ? "text-emerald-700" : "text-rose-700"}`}>{t("merchantPortal.sandbox.status", { status: result.status, ms: result.ms })}</p>
                <pre className="mt-2 max-h-[420px] overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{result.text}</pre>
              </>
            ) : (
              <p className="mt-1 text-xs text-slate-500">—</p>
            )}
          </section>
          <section className="card p-5">
            <p className="text-sm font-semibold text-slate-800">{t("merchantPortal.sandbox.curl")}</p>
            <pre className="mt-2 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{curl}</pre>
          </section>
          <section className="card p-5">
            <p className="text-sm font-semibold text-slate-800">{t("merchantPortal.sandbox.testCards")}</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {testCards.map((c) => (
                <li key={c.number}>
                  <code className="font-mono text-slate-800">{c.number}</code> — {c.description[lang]}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
