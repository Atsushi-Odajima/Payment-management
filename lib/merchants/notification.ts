// Builds a payment-result notification exactly as Wire Pay sends it to a
// merchant's notifyUrl, from the merchant's three notification settings.
// buildNotificationRequest is the real builder (lib/webhooks/deliver.ts);
// buildNotificationSample feeds it fixed values for the live preview in the
// merchant form and the README so integrators can implement the receiver.
//
// Interpretation of the three selectors:
//   format    – transport: JSON body (POST) / form-urlencoded body (POST) /
//               query string (GET)
//   paramSet  – which business fields are included (cumulative)
//   idFormat  – which identifier(s) are included: Wire Pay's unique
//               payment_id, the PSP-side transaction_id, or both
// "full" always carries transaction_id in addition to the idFormat choice,
// because it exists to give integrators everything we know.

import type { NotifyFormat, NotifyIdFormat, NotifyParamSet } from "./types";

export interface NotificationConfig {
  notifyUrl: string;
  notifyFormat: NotifyFormat;
  notifyParamSet: NotifyParamSet;
  notifyIdFormat: NotifyIdFormat;
}

export interface NotificationValues {
  payment_id: string;
  transaction_id: string;
  amount: string;
  currency: string;
  paid_at: string;
  status: string;
  payment_method: string;
  user_id: string;
  product_id: string;
  domain: string;
  merchant_id: string;
  /** Event name (payment.completed …); always included so receivers can branch on it. */
  event: string;
}

export interface NotificationRequest {
  method: "POST" | "GET";
  url: string;
  headers: Record<string, string>;
  /** Raw request body; null for GET. */
  body: string | null;
  /** Ordered parameter list (name, value, group) for the docs table. */
  params: Array<{ name: string; value: string; group: "id" | "minimal" | "standard" | "full" }>;
  /** What the signature is computed over (body, or the query string for GET). */
  signedPayload: string;
}

export type NotificationSample = NotificationRequest;

/** Stable sample values so previews are deterministic. */
export const SAMPLE_VALUES: NotificationValues = {
  payment_id: "pay_01J9X4M8K2Q7Z3T6",
  transaction_id: "txn_stripe_3QbX9y2eZvKYlo2C",
  amount: "4980",
  currency: "JPY",
  paid_at: "2026-09-01T12:34:56+09:00",
  status: "captured",
  payment_method: "credit",
  user_id: "user_10293",
  product_id: "SKU-2026-0042",
  domain: "shop.example.com",
  merchant_id: "MER-00001",
  event: "payment.completed",
};

export const SIGNATURE_HEADER = "X-Signature";
export const TIMESTAMP_HEADER = "X-Timestamp";
/** Kept for receivers written against the first spec (same v1 value, Stripe-style format). */
export const LEGACY_SIGNATURE_HEADER = "Wirepay-Signature";
const SAMPLE_SIGNATURE = "3f0c9c5d8f2b1a7e6d4c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e";
const SAMPLE_TIMESTAMP = "1756697696";
const USER_AGENT = "WirePay-Notify/1.0";

export function signatureHeaders(timestamp: string, v1: string): Record<string, string> {
  return {
    [SIGNATURE_HEADER]: `v1=${v1}`,
    [TIMESTAMP_HEADER]: timestamp,
    [LEGACY_SIGNATURE_HEADER]: `t=${timestamp},v1=${v1}`,
    "User-Agent": USER_AGENT,
  };
}

/** Build the request for one notification. `signature` headers are added by the caller once the payload is known. */
export function buildNotificationRequest(cfg: NotificationConfig, values: NotificationValues): NotificationRequest {
  const params: NotificationRequest["params"] = [];
  const push = (name: string, value: string, group: NotificationRequest["params"][number]["group"]) => params.push({ name, value, group });

  // Identifiers
  if (cfg.notifyIdFormat === "payment_id" || cfg.notifyIdFormat === "both") push("payment_id", values.payment_id, "id");
  if (cfg.notifyIdFormat === "transaction_id" || cfg.notifyIdFormat === "both") push("transaction_id", values.transaction_id, "id");

  // minimal
  push("event", values.event, "minimal");
  push("merchant_id", values.merchant_id, "minimal");
  push("amount", values.amount, "minimal");
  push("currency", values.currency, "minimal");
  push("paid_at", values.paid_at, "minimal");
  push("status", values.status, "minimal");

  // standard
  if (cfg.notifyParamSet === "standard" || cfg.notifyParamSet === "full") {
    push("payment_method", values.payment_method, "standard");
    push("user_id", values.user_id, "standard");
    push("product_id", values.product_id, "standard");
  }

  // full
  if (cfg.notifyParamSet === "full") {
    push("domain", values.domain, "full");
    if (!params.some((p) => p.name === "transaction_id")) push("transaction_id", values.transaction_id, "full");
  }

  const base = cfg.notifyUrl || "https://shop.example.com/wirepay/notify";
  const record = Object.fromEntries(params.map((p) => [p.name, p.value]));

  if (cfg.notifyFormat === "query_get") {
    const url = new URL(base);
    for (const p of params) url.searchParams.set(p.name, p.value);
    return { method: "GET", url: url.toString(), headers: {}, body: null, params, signedPayload: url.search.slice(1) };
  }

  if (cfg.notifyFormat === "form_post") {
    const body = new URLSearchParams(record).toString();
    return { method: "POST", url: base, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, params, signedPayload: body };
  }

  const body = JSON.stringify({ ...record, amount: Number(record.amount) });
  return { method: "POST", url: base, headers: { "Content-Type": "application/json" }, body, params, signedPayload: body };
}

/** Deterministic sample for the preview / docs (pretty-printed JSON, fixed signature). */
export function buildNotificationSample(cfg: NotificationConfig, merchantCode: string = SAMPLE_VALUES.merchant_id): NotificationSample {
  const req = buildNotificationRequest(cfg, { ...SAMPLE_VALUES, merchant_id: merchantCode });
  const headers = { ...req.headers, ...signatureHeaders(SAMPLE_TIMESTAMP, SAMPLE_SIGNATURE) };
  const body = req.body && cfg.notifyFormat === "json_post" ? JSON.stringify(JSON.parse(req.body), null, 2) : req.body;
  return { ...req, headers, body };
}

/** curl one-liner for the docs / preview. */
export function toCurl(sample: NotificationSample): string {
  const headers = Object.entries(sample.headers)
    .map(([k, v]) => `  -H '${k}: ${v}'`)
    .join(" \\\n");
  if (sample.method === "GET") return `curl '${sample.url}' \\\n${headers}`;
  const body = sample.body?.replace(/'/g, "'\\''") ?? "";
  return `curl -X POST '${sample.url}' \\\n${headers} \\\n  --data '${body}'`;
}
