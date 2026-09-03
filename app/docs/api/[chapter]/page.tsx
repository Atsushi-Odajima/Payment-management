import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { ApiDocsView, type EndpointView } from "@/components/views/api-docs-view";
import { isApiDocChapter } from "@/lib/api-docs/chapters";
import { loadApiDocChapter } from "@/lib/api-docs/load";
import { LANG_COOKIE, resolveInitialLang } from "@/lib/i18n";
import { extractHeadings, parseMarkdown, renderBlocks } from "@/lib/manual/markdown";
import { PUBLIC_API_BASE_PATH, PUBLIC_API_ENDPOINTS, zodToJsonSchema, type JsonSchema } from "@/lib/public-api/openapi";
import { PUBLIC_API_ERROR_CODES } from "@/lib/public-api/schemas";
import { PUBLIC_API_RATE_LIMIT } from "@/lib/public-api/rate-limit";
import { TEST_CARDS } from "@/lib/public-api/test-cards";
import { appBaseUrl } from "@/lib/webhooks/deliver";

export const dynamic = "force-dynamic";

function fields(schema: JsonSchema | undefined): EndpointView["request"] {
  if (!schema) return [];
  const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([name, s]) => ({
    name,
    type: s.enum ? (s.enum as unknown[]).map(String).join(" | ") : s.type === "object" ? "object" : String(s.type ?? "any") + (s.nullable ? " | null" : ""),
    required: required.has(name),
    description: String(s.description ?? ""),
    children: s.type === "object" ? fields(s) : undefined,
  }));
}

/** Public API documentation: hand-written chapters + the generated endpoint reference (Phase L-3). Public, no session. */
export default async function ApiDocsChapterPage({ params }: { params: { chapter: string } }) {
  if (!isApiDocChapter(params.chapter)) notFound();
  const lang = resolveInitialLang(cookies().get(LANG_COOKIE)?.value, headers().get("accept-language"));
  const md = await loadApiDocChapter(lang, params.chapter);
  const blocks = parseMarkdown(md);
  const endpoints: EndpointView[] = PUBLIC_API_ENDPOINTS.map((e) => ({
    operationId: e.operationId,
    method: e.method,
    path: e.path,
    summary: e.summary[lang],
    description: e.description[lang],
    status: e.status,
    headers: (e.headers ?? []).map((h) => ({ name: h.name, description: h.description[lang] })),
    pathParams: (e.pathParams ?? []).map((p) => ({ name: p.name, description: p.description[lang] })),
    query: e.query ? fields(zodToJsonSchema(e.query)) : [],
    request: e.requestBody ? fields(zodToJsonSchema(e.requestBody)) : [],
    responseExample: JSON.stringify({ ok: true, data: e.responseExample }, null, 2),
  }));
  return (
    <ApiDocsView chapter={params.chapter} headings={extractHeadings(blocks)} endpoints={endpoints} errorCodes={PUBLIC_API_ERROR_CODES} testCards={TEST_CARDS.map((c) => ({ number: c.number, outcome: c.outcome, description: c.description[lang] }))} baseUrl={`${appBaseUrl()}${PUBLIC_API_BASE_PATH}`} rateLimit={PUBLIC_API_RATE_LIMIT}>
      {renderBlocks(blocks)}
    </ApiDocsView>
  );
}
