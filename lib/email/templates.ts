// Email templates (Phase G-2): keys, placeholders, rendering and the default
// texts the seed installs for both languages. Templates are edited on
// /email-templates; the rendered email is logged by lib/email/send.ts.

import { z } from "zod";

export const EMAIL_TEMPLATE_KEYS = ["transfer_guide", "cvs_guide", "payment_completed", "refund_completed", "deposit_short", "statement", "admin_invite", "subscription_failed", "subscription_suspended", "notification"] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];
export function isEmailTemplateKey(v: unknown): v is EmailTemplateKey {
  return typeof v === "string" && (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(v);
}

export const EMAIL_LANGS = ["ja", "en"] as const;
export type EmailLang = (typeof EMAIL_LANGS)[number];

export const EMAIL_LOG_STATUSES = ["sent", "failed", "demo"] as const;
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];
export function isEmailLogStatus(v: unknown): v is EmailLogStatus {
  return typeof v === "string" && (EMAIL_LOG_STATUSES as readonly string[]).includes(v);
}

/** Placeholders available in every template ({{name}}). */
export const EMAIL_PLACEHOLDERS = [
  "merchantName",
  "customerName",
  "amount",
  "transferId",
  "deadline",
  "transactionId",
  "orderNumber",
  "productName",
  "shortAmount",
  "loginId",
  "initialPassword",
  "loginUrl",
  "planName",
  "retryDate",
  "title",
  "body",
  "link",
  "receiptNo",
  "cvsBrand",
] as const;
export type EmailPlaceholder = (typeof EMAIL_PLACEHOLDERS)[number];
export type EmailVars = Partial<Record<EmailPlaceholder, string>>;

/** Replace {{key}} tokens; unknown / missing keys render as empty strings. */
export function renderTemplate(text: string, vars: EmailVars): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => (vars as Record<string, string | undefined>)[key] ?? "");
}

/** Placeholder names used by a text (for the editor's checklist). */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
}

export const SAMPLE_EMAIL_VARS: Required<EmailVars> = {
  merchantName: "ハンドメイド雑貨 コトリ",
  customerName: "山田 太郎",
  amount: "¥4,980",
  transferId: "7301256",
  deadline: "2026/09/08",
  transactionId: "pay_01J9X4M8K2Q7Z3T6",
  orderNumber: "ORD-DEMO-001",
  productName: "春物ジャケット",
  shortAmount: "¥1,000",
  loginId: "new.operator",
  initialPassword: "Xk9v-2mPq-7Lw3",
  loginUrl: "https://payment-management-green.vercel.app/login",
  title: "Payment method suspended: credit",
  body: "acquirer outage",
  link: "https://wire-pay.example.com/payment-method-controls",
  planName: "スタンダードプラン（月額）",
  retryDate: "2026/09/06",
  receiptNo: "4102-9938-27716",
  cvsBrand: "セブン-イレブン",
};

/** Konbini store names as printed in customer e-mails and PDFs (ja / en), Phase K-1. */
export const CVS_BRAND_NAMES: Record<string, { ja: string; en: string }> = {
  seven: { ja: "セブン-イレブン", en: "7-Eleven" },
  lawson: { ja: "ローソン", en: "Lawson" },
  familymart: { ja: "ファミリーマート", en: "FamilyMart" },
  ministop: { ja: "ミニストップ", en: "Ministop" },
  other: { ja: "その他のコンビニ", en: "Other convenience store" },
};
export function cvsBrandName(brand: string | null, lang: EmailLang): string {
  return brand && brand in CVS_BRAND_NAMES ? CVS_BRAND_NAMES[brand][lang] : "";
}

export const emailTemplateUpdateSchema = z.object({
  subject: z.string().trim().min(1, "required").max(200, "tooLong"),
  body: z.string().trim().min(1, "required").max(5000, "tooLong"),
  enabled: z.boolean(),
});

export interface DefaultTemplate {
  key: EmailTemplateKey;
  lang: EmailLang;
  subject: string;
  body: string;
}

/** Default texts installed by the seed (idempotent upsert per key + lang). */
export const DEFAULT_EMAIL_TEMPLATES: DefaultTemplate[] = [
  {
    key: "transfer_guide",
    lang: "ja",
    subject: "【{{merchantName}}】お振込先のご案内（注文番号 {{orderNumber}}）",
    body: "{{customerName}} 様\n\n{{merchantName}} をご利用いただきありがとうございます。\n以下の内容でお振込みをお願いいたします。\n\n振込金額: {{amount}}\n振込ID: {{transferId}}\n振込期限: {{deadline}}\n商品: {{productName}}\n\n振込IDを振込名義の前に必ず入力してください。期限を過ぎるとご注文は自動的にキャンセルされます。",
  },
  {
    key: "transfer_guide",
    lang: "en",
    subject: "[{{merchantName}}] Bank transfer instructions (order {{orderNumber}})",
    body: "Dear {{customerName}},\n\nThank you for your order at {{merchantName}}. Please transfer the amount below.\n\nAmount: {{amount}}\nTransfer ID: {{transferId}}\nDeadline: {{deadline}}\nProduct: {{productName}}\n\nEnter the transfer ID before your name on the remittance. Orders not paid by the deadline are cancelled automatically.",
  },
  {
    key: "cvs_guide",
    lang: "ja",
    subject: "【{{merchantName}}】コンビニでのお支払い方法のご案内（注文番号 {{orderNumber}}）",
    body: "{{customerName}} 様\n\n{{merchantName}} をご利用いただきありがとうございます。\n以下の受付番号でコンビニのレジまたは端末からお支払いください。\n\nお支払い店舗: {{cvsBrand}}\n受付番号: {{receiptNo}}\nお支払い金額: {{amount}}\nお支払い期限: {{deadline}}\n商品: {{productName}}\n\n期限を過ぎるとご注文は自動的にキャンセルされます。",
  },
  {
    key: "cvs_guide",
    lang: "en",
    subject: "[{{merchantName}}] How to pay at the convenience store (order {{orderNumber}})",
    body: "Dear {{customerName}},\n\nThank you for your order at {{merchantName}}. Please pay at the store counter or kiosk with the receipt number below.\n\nStore: {{cvsBrand}}\nReceipt number: {{receiptNo}}\nAmount: {{amount}}\nDeadline: {{deadline}}\nProduct: {{productName}}\n\nOrders not paid by the deadline are cancelled automatically.",
  },
  {
    key: "payment_completed",
    lang: "ja",
    subject: "【{{merchantName}}】お支払いを確認しました（注文番号 {{orderNumber}}）",
    body: "{{customerName}} 様\n\n注文番号 {{orderNumber}} のお支払い {{amount}} を確認いたしました。\n取引ID: {{transactionId}}\n\n商品の発送準備に入ります。今後ともよろしくお願いいたします。",
  },
  {
    key: "payment_completed",
    lang: "en",
    subject: "[{{merchantName}}] Payment received (order {{orderNumber}})",
    body: "Dear {{customerName}},\n\nWe have received your payment of {{amount}} for order {{orderNumber}}.\nTransaction ID: {{transactionId}}\n\nYour order is now being prepared. Thank you for shopping with us.",
  },
  {
    key: "refund_completed",
    lang: "ja",
    subject: "【{{merchantName}}】返金手続きが完了しました（注文番号 {{orderNumber}}）",
    body: "{{customerName}} 様\n\n注文番号 {{orderNumber}} について {{amount}} の返金手続きが完了しました。\n取引ID: {{transactionId}}\n\nお支払い方法によっては反映までに数日かかる場合があります。",
  },
  {
    key: "refund_completed",
    lang: "en",
    subject: "[{{merchantName}}] Your refund has been processed (order {{orderNumber}})",
    body: "Dear {{customerName}},\n\nA refund of {{amount}} for order {{orderNumber}} has been processed.\nTransaction ID: {{transactionId}}\n\nDepending on your payment method it may take a few days to appear.",
  },
  {
    key: "deposit_short",
    lang: "ja",
    subject: "【{{merchantName}}】お振込金額が不足しています（振込ID {{transferId}}）",
    body: "{{customerName}} 様\n\n振込ID {{transferId}} のお振込みを確認しましたが、{{shortAmount}} 不足しております。\n請求金額: {{amount}}\n\nお手数ですが不足分を同じ振込IDで追加でお振込みください。期限: {{deadline}}",
  },
  {
    key: "deposit_short",
    lang: "en",
    subject: "[{{merchantName}}] Your transfer is short (transfer ID {{transferId}})",
    body: "Dear {{customerName}},\n\nWe received your transfer for ID {{transferId}}, but it is {{shortAmount}} short of the amount due ({{amount}}).\n\nPlease transfer the balance using the same transfer ID by {{deadline}}.",
  },
  {
    key: "statement",
    lang: "ja",
    subject: "【Wire Pay】{{merchantName}} 様 精算明細のご送付",
    body: "{{merchantName}} ご担当者様\n\n今回の精算明細を送付いたします。差引支払額: {{amount}}\n明細は管理画面の精算管理からもご確認いただけます。",
  },
  {
    key: "statement",
    lang: "en",
    subject: "[Wire Pay] Settlement statement for {{merchantName}}",
    body: "Dear {{merchantName}},\n\nPlease find your settlement statement. Net payout: {{amount}}\nThe full statement is also available under Settlements in the dashboard.",
  },
  {
    key: "admin_invite",
    lang: "ja",
    subject: "【Wire Pay】管理画面へ招待されました",
    body: "Wire Pay 管理画面のアカウントが作成されました。\n\nログインID: {{loginId}}\n初期パスワード: {{initialPassword}}\nログイン: {{loginUrl}}\n\n初回ログイン後にパスワードを変更し、二段階認証の登録をおすすめします。",
  },
  {
    key: "admin_invite",
    lang: "en",
    subject: "[Wire Pay] You have been invited to the dashboard",
    body: "An operator account has been created for you on Wire Pay.\n\nLogin ID: {{loginId}}\nInitial password: {{initialPassword}}\nSign in: {{loginUrl}}\n\nPlease change your password after the first login and enable two-factor authentication.",
  },
  {
    key: "subscription_failed",
    lang: "ja",
    subject: "【{{merchantName}}】定期課金のお支払いに失敗しました（{{planName}}）",
    body: "{{customerName}} 様\n\n{{planName}} の定期課金 {{amount}} のお支払いに失敗しました。\n{{retryDate}} に再度お支払いを試みます。お支払い方法をご確認ください。",
  },
  {
    key: "subscription_failed",
    lang: "en",
    subject: "[{{merchantName}}] Subscription payment failed ({{planName}})",
    body: "Dear {{customerName}},\n\nThe {{amount}} payment for your {{planName}} subscription failed.\nWe will retry on {{retryDate}}. Please check your payment method.",
  },
  {
    key: "subscription_suspended",
    lang: "ja",
    subject: "【{{merchantName}}】定期課金を停止しました（{{planName}}）",
    body: "{{customerName}} 様\n\nお支払いが 3 回続けて失敗したため、{{planName}} の定期課金を停止しました。再開をご希望の場合はお支払い方法を更新のうえご連絡ください。",
  },
  {
    key: "subscription_suspended",
    lang: "en",
    subject: "[{{merchantName}}] Subscription suspended ({{planName}})",
    body: "Dear {{customerName}},\n\nYour {{planName}} subscription has been suspended after three failed payments. Update your payment method and contact us to resume it.",
  },
  {
    key: "notification",
    lang: "ja",
    subject: "【Wire Pay 通知】{{title}}",
    body: "{{title}}\n\n{{body}}\n\n{{link}}\n\n（通知センターの設定でメール送信を選んだ種別だけ届きます）",
  },
  {
    key: "notification",
    lang: "en",
    subject: "[Wire Pay] {{title}}",
    body: "{{title}}\n\n{{body}}\n\n{{link}}\n\n(You receive this because e-mail is enabled for this kind in your notification settings.)",
  },
];
