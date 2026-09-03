// OpenAPI 3.0 document of the public API v1 (Phase L-1 / L-3). The single
// source: request schemas are converted from the zod schemas in ./schemas.ts,
// examples come from ./serialize.ts, and a test checks that every path here
// has a route file (and vice versa). Served at GET /api/v1/openapi.json and
// rendered on /docs/api.

import { z, type ZodTypeAny } from "zod";
import { PUBLIC_API_ERROR_CODES, createPaymentLinkApiSchema, createRefundApiSchema, createTransactionApiSchema, listTransactionsQuerySchema } from "./schemas";
import { EXAMPLE_PAYMENT_LINK, EXAMPLE_REFUND, EXAMPLE_TRANSACTION } from "./serialize";
import { TEST_CARDS } from "./test-cards";

export const PUBLIC_API_VERSION = "1.0.0";
export const PUBLIC_API_BASE_PATH = "/api/v1";

export type JsonSchema = Record<string, unknown>;

/** zod → JSON Schema for the subset the API uses (objects, strings, numbers, booleans, enums, optional / nullable / default, describe). */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = schema._def;
  const describe = (s: JsonSchema): JsonSchema => (schema.description ? { ...s, description: schema.description } : s);
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(def.innerType);
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(def.innerType);
    return describe({ ...inner, nullable: true });
  }
  if (schema instanceof z.ZodDefault) return describe({ ...zodToJsonSchema(def.innerType), default: def.defaultValue() });
  if (schema instanceof z.ZodEffects) return describe(zodToJsonSchema(def.schema));
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = zodToJsonSchema(v);
      if (!(v instanceof z.ZodOptional) && !(v instanceof z.ZodDefault)) required.push(k);
    }
    return describe({ type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false });
  }
  if (schema instanceof z.ZodString) {
    const s: JsonSchema = { type: "string" };
    for (const c of def.checks ?? []) {
      if (c.kind === "min") s.minLength = c.value;
      if (c.kind === "max") s.maxLength = c.value;
      if (c.kind === "email") s.format = "email";
      if (c.kind === "regex") s.pattern = c.regex.source;
    }
    return describe(s);
  }
  if (schema instanceof z.ZodNumber) {
    const s: JsonSchema = { type: "number" };
    for (const c of def.checks ?? []) {
      if (c.kind === "int") s.type = "integer";
      if (c.kind === "min") s.minimum = c.value;
      if (c.kind === "max") s.maximum = c.value;
    }
    return describe(s);
  }
  if (schema instanceof z.ZodBoolean) return describe({ type: "boolean" });
  if (schema instanceof z.ZodEnum) return describe({ type: "string", enum: [...def.values] });
  if (schema instanceof z.ZodLiteral) return describe({ type: typeof def.value, enum: [def.value] });
  return describe({});
}

export interface EndpointDoc {
  operationId: string;
  method: "get" | "post";
  path: string;
  summary: { ja: string; en: string };
  description: { ja: string; en: string };
  requestBody?: ZodTypeAny;
  query?: ZodTypeAny;
  pathParams?: Array<{ name: string; description: { ja: string; en: string } }>;
  headers?: Array<{ name: string; description: { ja: string; en: string } }>;
  responseExample: unknown;
  /** Route file relative to app/ (checked by tests). */
  routeFile: string;
  status: number;
}

export const PUBLIC_API_ENDPOINTS: readonly EndpointDoc[] = [
  {
    operationId: "createTransaction",
    method: "post",
    path: "/transactions",
    summary: { ja: "取引を作成", en: "Create a transaction" },
    description: {
      ja: "決済を開始します。credit / qr は autoCapture に応じて即時完了または与信済、convenience は受付番号、bank は振込IDと期限を返します。加盟店・環境（test / live）は API キーから決まり、加盟店に有効化された決済手段・停止中の手段・限度額・ブラックリストが適用されます。",
      en: "Starts a payment. credit / qr complete immediately (or stay authorized when autoCapture is false), convenience returns a receipt number, bank a transfer id and deadline. Merchant and environment come from the API key; enabled methods, suspensions, limits and the blacklist apply.",
    },
    requestBody: createTransactionApiSchema,
    headers: [{ name: "Idempotency-Key", description: { ja: "同じキーでの再送は同じ取引を返します（8〜128 文字）", en: "A retry with the same key returns the same transaction (8-128 chars)" } }],
    responseExample: EXAMPLE_TRANSACTION,
    routeFile: "api/v1/transactions/route.ts",
    status: 201,
  },
  {
    operationId: "listTransactions",
    method: "get",
    path: "/transactions",
    summary: { ja: "取引を一覧", en: "List transactions" },
    description: { ja: "自加盟店・同じ環境の取引を新しい順に返します。startingAfter でページングします。", en: "Returns the merchant's transactions of the key's environment, newest first; page with startingAfter." },
    query: listTransactionsQuerySchema,
    responseExample: { data: [EXAMPLE_TRANSACTION], hasMore: false },
    routeFile: "api/v1/transactions/route.ts",
    status: 200,
  },
  {
    operationId: "getTransaction",
    method: "get",
    path: "/transactions/{id}",
    summary: { ja: "取引を取得", en: "Retrieve a transaction" },
    description: { ja: "取引 1 件を返します。他の加盟店・他の環境の取引は 404 です。", en: "Returns one transaction; another merchant's or environment's transaction answers 404." },
    pathParams: [{ name: "id", description: { ja: "取引ID", en: "Transaction id" } }],
    responseExample: EXAMPLE_TRANSACTION,
    routeFile: "api/v1/transactions/[id]/route.ts",
    status: 200,
  },
  {
    operationId: "createRefund",
    method: "post",
    path: "/refunds",
    summary: { ja: "返金を申請", en: "Request a refund" },
    description: {
      ja: "完了した取引の返金を申請します。申請は PSP の審査（承認 / 否認）を経て完了し、完了時に refund.completed の Webhook が届きます。返金可能期限を過ぎた取引は 409 です。",
      en: "Requests a refund of a completed transaction. The PSP approves or rejects it; refund.completed is sent when it completes. Past the refund window the request answers 409.",
    },
    requestBody: createRefundApiSchema,
    responseExample: EXAMPLE_REFUND,
    routeFile: "api/v1/refunds/route.ts",
    status: 201,
  },
  {
    operationId: "createPaymentLink",
    method: "post",
    path: "/payment-links",
    summary: { ja: "決済リンクを作成", en: "Create a payment link" },
    description: { ja: "ホスト型決済ページの URL を発行します。加盟店に有効化された決済手段が顧客に表示されます。", en: "Issues a hosted payment page URL; the merchant's enabled methods are offered to the customer." },
    requestBody: createPaymentLinkApiSchema,
    responseExample: EXAMPLE_PAYMENT_LINK,
    routeFile: "api/v1/payment-links/route.ts",
    status: 201,
  },
];

function errorSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      ok: { type: "boolean", enum: [false] },
      error: { type: "object", properties: { code: { type: "string", enum: PUBLIC_API_ERROR_CODES.map((e) => e.code) }, message: { type: "string" }, details: {} }, required: ["code", "message"] },
    },
    required: ["ok", "error"],
  };
}

function okSchema(example: unknown): JsonSchema {
  return { type: "object", properties: { ok: { type: "boolean", enum: [true] }, data: { type: "object" } }, required: ["ok", "data"], example: { ok: true, data: example } };
}

export function buildOpenApiSpec(baseUrl: string, lang: "ja" | "en" = "en"): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of PUBLIC_API_ENDPOINTS) {
    const op: Record<string, unknown> = {
      operationId: e.operationId,
      summary: e.summary[lang],
      description: e.description[lang],
      security: [{ bearerAuth: [] }],
      parameters: [
        ...(e.pathParams ?? []).map((p) => ({ name: p.name, in: "path", required: true, schema: { type: "string" }, description: p.description[lang] })),
        ...(e.headers ?? []).map((h) => ({ name: h.name, in: "header", required: false, schema: { type: "string" }, description: h.description[lang] })),
        ...(e.query ? Object.entries(zodToJsonSchema(e.query).properties as Record<string, JsonSchema>).map(([name, schema]) => ({ name, in: "query", required: false, schema, description: schema.description })) : []),
      ],
      responses: {
        [String(e.status)]: { description: "Success", content: { "application/json": { schema: okSchema(e.responseExample) } } },
        "4XX": { description: "Client error (see error codes)", content: { "application/json": { schema: errorSchema() } } },
        "429": { description: "Rate limited", headers: { "Retry-After": { schema: { type: "integer" } } }, content: { "application/json": { schema: errorSchema() } } },
      },
    };
    if (e.requestBody) op.requestBody = { required: true, content: { "application/json": { schema: zodToJsonSchema(e.requestBody) } } };
    paths[e.path] = { ...(paths[e.path] ?? {}), [e.method]: op };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Wire Pay API",
      version: PUBLIC_API_VERSION,
      description: lang === "ja" ? "Wire Pay の加盟店向け公開 API。Bearer API キーで認証し、キーの環境（test / live）にデータが分かれます。" : "Wire Pay's merchant-facing public API. Authenticate with a Bearer API key; data is separated by the key's environment (test / live).",
    },
    servers: [{ url: `${baseUrl}${PUBLIC_API_BASE_PATH}` }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "API key: wp_test_ak_… or wp_live_ak_…" } },
      schemas: {
        Transaction: { type: "object", example: EXAMPLE_TRANSACTION },
        Refund: { type: "object", example: EXAMPLE_REFUND },
        PaymentLink: { type: "object", example: EXAMPLE_PAYMENT_LINK },
        Error: errorSchema(),
      },
    },
    paths,
    "x-error-codes": PUBLIC_API_ERROR_CODES,
    "x-test-cards": TEST_CARDS.map((c) => ({ number: c.number, outcome: c.outcome, description: c.description[lang] })),
    "x-rate-limit": { limit: 60, windowSeconds: 60, scope: "merchant × environment" },
  };
}
