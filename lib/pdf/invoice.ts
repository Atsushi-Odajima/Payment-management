// Qualified invoice PDF (適格請求書, Phase K-3): the PSP bills the merchant
// for the fees of a settlement batch. Only confirmed-or-later batches can be
// invoiced (the lines are frozen from confirmation). Fees are tax-inclusive
// (lib/settlements/tax.ts); the invoice shows the totals per tax rate and the
// tax included in each, as the invoice system requires.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { formatDateTime } from "@/lib/i18n";
import { loadGlobalSettings } from "@/lib/settings/global";
import { partsInTz, ymd } from "@/lib/settlements/schedule";
import { summarizeTax } from "@/lib/settlements/tax";
import { isTaxCategory, type TaxCategory } from "@/lib/settlements/types";
import { COLORS, Pdf, yen } from "./document";

const METHOD_LABEL: Record<string, string> = {
  credit: "クレジットカード決済手数料",
  qr: "QRコード決済手数料",
  convenience: "コンビニ決済手数料",
  bank: "銀行振込決済手数料",
  other: "その他決済手数料",
};
const CATEGORY_LABEL: Record<TaxCategory, string> = { standard10: "10%", reduced8: "8%（軽減）", exempt: "非課税 / 対象外" };


export interface InvoicePdfResult {
  bytes: Uint8Array;
  filename: string;
  invoiceNo: string;
}

export async function buildInvoicePdf(db: PrismaClient, batchId: string, now: Date = new Date()): Promise<InvoicePdfResult> {
  const b = await db.settlementBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      status: true,
      invoiceNo: true,
      livemode: true,
      periodFrom: true,
      periodTo: true,
      grossAmount: true,
      feeAmount: true,
      settlementFee: true,
      netAmount: true,
      scheduledAt: true,
      merchant: { select: { merchantCode: true, siteName: true, companyName: true, address: true, invoiceNumber: true } },
      lines: { select: { kind: true, method: true, amount: true, fee: true, taxCategory: true } },
    },
  });
  if (!b) throw new ApiError(404, "not_found", "errors.notFound");
  if (b.status === "collecting") throw new ApiError(409, "settlement_not_confirmed", "errors.invoiceNotConfirmed");
  // The number is assigned on confirmation (Phase P1-5) and never recomputed;
  // a confirmed batch from before the column existed needs the backfill script.
  if (!b.invoiceNo) throw new ApiError(409, "invoice_no_missing", "errors.invoiceNoMissing");
  const issuer = await loadGlobalSettings(db);
  const invoiceNo = b.invoiceNo;
  const period = `${ymd(partsInTz(b.periodFrom))} 〜 ${ymd(partsInTz(new Date(b.periodTo.getTime() - 1)))}`;

  // Fee lines grouped by method (+ the transfer fee), each with its tax category.
  const groups = new Map<string, { count: number; base: number; fee: number; taxCategory: TaxCategory }>();
  for (const l of b.lines) {
    if (l.kind !== "payment" || l.fee === 0) continue;
    const key = l.method ?? "other";
    const g = groups.get(key) ?? { count: 0, base: 0, fee: 0, taxCategory: isTaxCategory(l.taxCategory) ? l.taxCategory : "standard10" };
    g.count++;
    g.base += l.amount;
    g.fee += l.fee;
    groups.set(key, g);
  }
  const items: Array<{ label: string; count: number; base: number; fee: number; taxCategory: TaxCategory }> = [...groups.entries()].map(([k, g]) => ({ label: METHOD_LABEL[k] ?? METHOD_LABEL.other, ...g }));
  if (b.settlementFee > 0) items.push({ label: "振込手数料", count: 1, base: 0, fee: b.settlementFee, taxCategory: "standard10" });
  const taxRows = summarizeTax(
    items.map((i) => ({ taxCategory: i.taxCategory, amount: i.fee })),
    issuer.taxRounding,
  );
  const total = items.reduce((s, i) => s + i.fee, 0);
  const totalTax = taxRows.reduce((s, r) => s + r.tax, 0);

  const pdf = await Pdf.create({ title: `請求書 ${invoiceNo}` });
  if (!b.livemode) pdf.text("テストデータ / TEST DATA", { size: 8, color: COLORS.muted, gap: 2 });
  pdf.text("請 求 書", { size: 22, bold: true, align: "center", gap: 0 });
  pdf.text("適格請求書 / Qualified invoice", { size: 9, color: COLORS.muted, align: "center", gap: 10 });
  pdf.rule({ color: COLORS.accent, thickness: 1.2, gap: 12 });

  // Recipient (merchant) on the left, issuer (PSP) on the right.
  const top = pdf.y;
  const half = pdf.contentWidth / 2 - 10;
  const m = b.merchant;
  let left = top;
  left += pdf.textAt(`${m.companyName} 御中`, 48, left, { size: 13, bold: true });
  left += pdf.textAt(`${m.merchantCode} / ${m.siteName}`, 48, left, { size: 9, maxWidth: half });
  if (m.address) left += pdf.textAt(m.address, 48, left, { size: 9, maxWidth: half });
  if (m.invoiceNumber) left += pdf.textAt(`登録番号 ${m.invoiceNumber}`, 48, left, { size: 9 });
  const rx = 48 + half + 20;
  let right = top;
  right += pdf.textAt(issuer.issuerName || "Wire Pay", 48 + half + 20, right, { size: 11, bold: true, maxWidth: half });
  if (issuer.issuerRegistrationNo) right += pdf.textAt(`登録番号 ${issuer.issuerRegistrationNo}`, rx, right, { size: 9 });
  if (issuer.issuerAddress) right += pdf.textAt(issuer.issuerAddress, rx, right, { size: 9, maxWidth: half });
  if (issuer.issuerTel) right += pdf.textAt(`TEL ${issuer.issuerTel}`, rx, right, { size: 9 });
  right += pdf.textAt(`請求書番号 ${invoiceNo}`, rx, right + 4, { size: 9 });
  right += pdf.textAt(`発行日 ${formatDateTime(now, "ja").slice(0, 10)}`, rx, right, { size: 9 });
  pdf.y = Math.max(left, right) + 12;

  pdf.text(`対象期間 ${period} の決済手数料を下記のとおりご請求申し上げます。`, { size: 10, gap: 8 });
  pdf.text(`ご請求金額（税込）  ${yen(total)}`, { size: 16, bold: true, gap: 2 });
  pdf.text(`（うち消費税 ${yen(totalTax)}）　精算バッチの差引支払額 ${yen(b.netAmount)} から控除済みです。`, { size: 8.5, color: COLORS.muted, gap: 12 });

  pdf.table(
    [
      { label: "摘要", width: 190 },
      { label: "件数", width: 50, align: "right" },
      { label: "対象売上", width: 95, align: "right" },
      { label: "税区分", width: 70 },
      { label: "金額（税込）", width: 94, align: "right" },
    ],
    items.map((i) => [i.label, String(i.count), i.base ? yen(i.base) : "—", CATEGORY_LABEL[i.taxCategory], yen(i.fee)]),
    { footer: [["合計", "", yen(b.grossAmount), "", yen(total)]] },
  );
  pdf.space(14);

  pdf.text("税率ごとの内訳 / Breakdown by tax rate", { size: 9, bold: true, color: COLORS.muted, gap: 4 });
  pdf.table(
    [
      { label: "税率", width: 120 },
      { label: "税抜金額", width: 126, align: "right" },
      { label: "消費税額", width: 126, align: "right" },
      { label: "税込金額", width: 127, align: "right" },
    ],
    taxRows.map((r) => [CATEGORY_LABEL[r.category], yen(r.exclusive), yen(r.tax), yen(r.inclusive)]),
    { footer: [["合計", yen(total - totalTax), yen(totalTax), yen(total)]] },
  );
  pdf.space(12);
  pdf.text(`端数処理: 税率ごとの消費税額を円未満${issuer.taxRounding === "round" ? "四捨五入" : issuer.taxRounding === "ceil" ? "切り上げ" : "切り捨て"}。手数料は内税表示です。`, { size: 8, color: COLORS.muted, gap: 2 });
  pdf.text(`精算ステータス: ${b.status}${b.scheduledAt ? `　振込予定日 ${formatDateTime(b.scheduledAt, "ja").slice(0, 10)}` : ""}`, { size: 8, color: COLORS.muted, gap: 2 });
  pdf.footer(`Wire Pay · ${invoiceNo}`);
  return { bytes: await pdf.bytes(), filename: `invoice-${invoiceNo}.pdf`, invoiceNo };
}
