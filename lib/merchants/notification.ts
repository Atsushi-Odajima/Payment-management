// Builds a sample payment-result notification exactly as Wire Pay would send
// it to a merchant's notifyUrl, from the merchant's three notification
// settings. Used for the live preview in the merchant form and documented in
// the README so integrators can implement the receiving side.
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

export interface NotificationSample {
  method: "POST" | "GET";
  url: string;
  headers: Record<string, string>;
  /** Raw request body; null for GET. */
  body: string | null;
  /** Ordered parameter list (name, sample value, description key) for the docs table. */
  params: Array<{ name: string; value: string; group: "id" | "minimal" | "standard" | "full" }>;
}

/** Stable sample values so previews are deterministic. */
export const SAMPLE_VALUES = {
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
} as const;

const SIGNATURE_HEADER = "Wirepay-Signature";
const SAMPLE_SIGNATURE = "t=1756697696,v1=3f0c9c5d8f2b1a7e6d4c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e";

export function buildNotificationSample(
  cfg: NotificationConfig,
  merchantCode: string = SAMPLE_VALUES.merchant_id,
): NotificationSample {
  const params: NotificationSample["params"] = [];
  const push = (name: string, value: string, group: NotificationSample["params"][number]["group"]) =>
    params.push({ name, value, group });

  // Identifiers
  if (cfg.notifyIdFormat === "payment_id" || cfg.notifyIdFormat === "both") {
    push("payment_id", SAMPLE_VALUES.payment_id, "id");
  }
  if (cfg.notifyIdFormat === "transaction_id" || cfg.notifyIdFormat === "both") {
    push("transaction_id", SAMPLE_VALUES.transaction_id, "id");
  }

  // minimal
  push("merchant_id", merchantCode, "minimal");
  push("amount", SAMPLE_VALUES.amount, "minimal");
  push("currency", SAMPLE_VALUES.currency, "minimal");
  push("paid_at", SAMPLE_VALUES.paid_at, "minimal");
  push("status", SAMPLE_VALUES.status, "minimal");

  // standard
  if (cfg.notifyParamSet === "standard" || cfg.notifyParamSet === "full") {
    push("payment_method", SAMPLE_VALUES.payment_method, "standard");
    push("user_id", SAMPLE_VALUES.user_id, "standard");
    push("product_id", SAMPLE_VALUES.product_id, "standard");
  }

  // full
  if (cfg.notifyParamSet === "full") {
    push("domain", SAMPLE_VALUES.domain, "full");
    if (!params.some((p) => p.name === "transaction_id")) {
      push("transaction_id", SAMPLE_VALUES.transaction_id, "full");
    }
  }

  const base = cfg.notifyUrl || "https://shop.example.com/wirepay/notify";
  const record = Object.fromEntries(params.map((p) => [p.name, p.value]));

  if (cfg.notifyFormat === "query_get") {
    const url = new URL(base);
    for (const p of params) url.searchParams.set(p.name, p.value);
    return {
      method: "GET",
      url: url.toString(),
      headers: { [SIGNATURE_HEADER]: SAMPLE_SIGNATURE, "User-Agent": "WirePay-Notify/1.0" },
      body: null,
      params,
    };
  }

  if (cfg.notifyFormat === "form_post") {
    return {
      method: "POST",
      url: base,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        [SIGNATURE_HEADER]: SAMPLE_SIGNATURE,
        "User-Agent": "WirePay-Notify/1.0",
      },
      body: new URLSearchParams(record).toString(),
      params,
    };
  }

  return {
    method: "POST",
    url: base,
    headers: {
      "Content-Type": "application/json",
      [SIGNATURE_HEADER]: SAMPLE_SIGNATURE,
      "User-Agent": "WirePay-Notify/1.0",
    },
    body: JSON.stringify(
      { ...record, amount: Number(record.amount) },
      null,
      2,
    ),
    params,
  };
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
