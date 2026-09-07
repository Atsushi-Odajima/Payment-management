// Receipt PDF (領収書, Phase K-2). Issued in the merchant's name — the seller
// is the party that received the money — with Wire Pay shown as the payment
// agent. Bilingual labels so one document serves both dictionaries; the
// numbers, names and dates come from the transaction and the Receipt row.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { formatDateTime } from "@/lib/i18n";
import { loadGlobalSettings } from "@/lib/settings/global";
import { COLORS, MARGIN, Pdf, yen } from "./document";

const METHOD_LABEL: Record<string, string> = {
  credit: "クレジットカード / Credit card",
  qr: "QRコード決済 / QR code",
  convenience: "コンビニ決済 / Konbini",
  bank: "銀行振込 / Bank transfer",
  other: "その他 / Other",
};

export interface ReceiptPdfResult {
  bytes: Uint8Array;
  filename: string;
  receiptNo: string;
}

export async function buildReceiptPdf(db: PrismaClient, paymentId: string): Promise<ReceiptPdfResult> {
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      orderNumber: true,
      amount: true,
      amountRefunded: true,
      productName: true,
      method: true,
      capturedAt: true,
      createdAt: true,
      livemode: true,
      receipt: { select: { receiptNo: true, recipientName: true, amount: true, description: true, reissueCount: true, issuedAt: true, lastIssuedAt: true } },
      merchant: { select: { siteName: true, companyName: true, address: true, invoiceNumber: true } },
      provider: { select: { category: true } },
    },
  });
  if (!p || !p.receipt) throw new ApiError(404, "not_found", "errors.notFound");
  const issuer = await loadGlobalSettings(db);
  const r = p.receipt;
  const pdf = await Pdf.create({ title: `領収書 ${r.receiptNo}` });

  if (r.reissueCount > 0) pdf.stamp("再発行 / REISSUED");
  if (!p.livemode) pdf.text("テスト取引 / TEST TRANSACTION", { size: 8, color: COLORS.muted, gap: 2 });
  pdf.text("領 収 書", { size: 24, bold: true, align: "center", gap: 0 });
  pdf.text("RECEIPT", { size: 10, color: COLORS.muted, align: "center", gap: 10 });
  pdf.rule({ color: COLORS.accent, thickness: 1.2, gap: 14 });

  // Recipient and amount.
  const recipient = r.recipientName ? `${r.recipientName} 様` : "上様";
  pdf.text(recipient, { size: 16, bold: true, gap: 2 });
  pdf.text("To:", { size: 8, color: COLORS.muted, gap: 10 });
  pdf.text(yen(r.amount), { size: 28, bold: true, align: "center", gap: 2 });
  pdf.text("金額（税込） / Amount (tax included)", { size: 8, color: COLORS.muted, align: "center", gap: 12 });
  pdf.rule({ gap: 10 });

  const paidAt = p.capturedAt ?? p.createdAt;
  pdf.rows(
    [
      ["但し / For", r.description ? `${r.description} として` : p.productName ? `${p.productName} として` : "商品代金として"],
      ["領収日 / Paid on", formatDateTime(paidAt, "ja")],
      ["決済方法 / Method", METHOD_LABEL[p.method ?? p.provider.category] ?? METHOD_LABEL.other],
      ["注文番号 / Order", p.orderNumber],
      ["取引ID / Transaction", p.id],
      ["領収書番号 / Receipt no.", r.receiptNo],
      ["発行日 / Issued", `${formatDateTime(r.lastIssuedAt, "ja")}${r.reissueCount > 0 ? `（再発行 ${r.reissueCount} 回目 / reissue #${r.reissueCount}）` : ""}`],
      ...(p.amountRefunded > 0 ? [["備考 / Note", `返金 ${yen(p.amountRefunded)} を差し引いた金額です / Net of refunds ${yen(p.amountRefunded)}.`] as [string, string]] : []),
    ],
    { labelWidth: 150 },
  );
  pdf.space(6);
  pdf.text("上記の金額を正に領収いたしました。/ Received the amount above with thanks.", { size: 9, gap: 16 });
  pdf.rule({ gap: 10 });

  // Issuer (the merchant) and the payment agent (the PSP).
  pdf.text("発行者 / Issuer", { size: 9, bold: true, color: COLORS.muted, gap: 4 });
  const m = p.merchant;
  if (m) {
    pdf.text(m.companyName, { size: 12, bold: true, gap: 1 });
    pdf.text(m.siteName, { size: 10, gap: 1 });
    if (m.address) pdf.text(m.address, { size: 9, gap: 1 });
    if (m.invoiceNumber) pdf.text(`登録番号 / Registration no. ${m.invoiceNumber}`, { size: 9, gap: 1 });
  } else {
    pdf.text("（加盟店未設定 / no merchant）", { size: 10, gap: 1 });
  }
  pdf.space(8);
  pdf.text("決済代行 / Payment agent", { size: 9, bold: true, color: COLORS.muted, gap: 4 });
  pdf.text(issuer.issuerName || "Wire Pay", { size: 10, gap: 1 });
  if (issuer.issuerAddress) pdf.text(issuer.issuerAddress, { size: 9, gap: 1 });
  if (issuer.issuerRegistrationNo) pdf.text(`登録番号 / Registration no. ${issuer.issuerRegistrationNo}`, { size: 9, gap: 1 });
  if (issuer.issuerTel) pdf.text(`TEL ${issuer.issuerTel}`, { size: 9, gap: 1 });

  pdf.space(14);
  pdf.text("この領収書は電子的に発行されたものです。印紙税の課税対象ではありません。/ This receipt was issued electronically.", { size: 7.5, color: COLORS.muted, x: MARGIN });
  pdf.footer(`Wire Pay · ${r.receiptNo}`);

  return { bytes: await pdf.bytes(), filename: `receipt-${r.receiptNo}.pdf`, receiptNo: r.receiptNo };
}
