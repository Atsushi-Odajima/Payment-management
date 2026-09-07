// Consumption tax on settlement fees (Phase K-3). Fees stored on the lines
// (and the merchant's transfer fee) are tax-inclusive — the settlement's net
// payout already deducted them in full — so the invoice breaks the included
// tax out per rate: tax = round(feeTotal × rate / (100 + rate)), rounded to
// the yen with the configured method (floor by default). Pure functions.

import { TAX_RATE_PERCENT, isTaxCategory, type TaxCategory, type TaxRounding } from "./types";

export function roundTax(value: number, rounding: TaxRounding): number {
  switch (rounding) {
    case "round":
      return Math.round(value);
    case "ceil":
      return Math.ceil(value);
    default:
      return Math.floor(value);
  }
}

/** Tax included in a tax-inclusive amount at the category's rate. */
export function includedTax(inclusive: number, category: TaxCategory, rounding: TaxRounding): number {
  const rate = TAX_RATE_PERCENT[category];
  if (rate === 0) return 0;
  return roundTax((inclusive * rate) / (100 + rate), rounding);
}

export interface TaxSummaryRow {
  category: TaxCategory;
  ratePercent: number;
  /** Tax-inclusive total of the category. */
  inclusive: number;
  tax: number;
  /** inclusive − tax. */
  exclusive: number;
}

/** Group tax-inclusive amounts by category and compute the tax of each rate. */
export function summarizeTax(items: ReadonlyArray<{ taxCategory: string | null; amount: number }>, rounding: TaxRounding): TaxSummaryRow[] {
  const totals = new Map<TaxCategory, number>();
  for (const it of items) {
    const c: TaxCategory = isTaxCategory(it.taxCategory) ? it.taxCategory : "standard10";
    totals.set(c, (totals.get(c) ?? 0) + it.amount);
  }
  return (["standard10", "reduced8", "exempt"] as const)
    .filter((c) => totals.has(c))
    .map((c) => {
      const inclusive = totals.get(c)!;
      const tax = includedTax(inclusive, c, rounding);
      return { category: c, ratePercent: TAX_RATE_PERCENT[c], inclusive, tax, exclusive: inclusive - tax };
    });
}

export interface InvoiceItem {
  /** Payment method key (credit / qr / …) or "settlement_fee" for the transfer fee. */
  key: string;
  count: number;
  /** Gross sales the fee was charged on (0 for the transfer fee). */
  base: number;
  /** Tax-inclusive fee total. */
  fee: number;
  taxCategory: TaxCategory;
}

/**
 * Fee lines grouped by payment method plus the merchant's transfer fee — the
 * rows of the qualified invoice. Shared by the PDF and the settlement detail
 * screen (Phase P3-5) so both show the same numbers.
 */
export function invoiceItems(lines: ReadonlyArray<{ kind: string; method: string | null; amount: number; fee: number; taxCategory: string | null }>, settlementFee: number): InvoiceItem[] {
  const groups = new Map<string, InvoiceItem>();
  for (const l of lines) {
    if (l.kind !== "payment" || l.fee === 0) continue;
    const key = l.method ?? "other";
    const g = groups.get(key) ?? { key, count: 0, base: 0, fee: 0, taxCategory: isTaxCategory(l.taxCategory) ? l.taxCategory : "standard10" };
    g.count++;
    g.base += l.amount;
    g.fee += l.fee;
    groups.set(key, g);
  }
  const items = [...groups.values()];
  if (settlementFee > 0) items.push({ key: "settlement_fee", count: 1, base: 0, fee: settlementFee, taxCategory: "standard10" });
  return items;
}

/** Default category of a settlement line's fee: services are taxed at the standard rate; lines without a fee carry none. */
export function defaultTaxCategory(kind: "payment" | "refund" | "chargeback"): TaxCategory {
  return kind === "payment" ? "standard10" : "exempt";
}
