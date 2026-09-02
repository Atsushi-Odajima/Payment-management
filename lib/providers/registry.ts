import type { Category, ProviderDefinition } from "./types";

// All human-readable copy is stored as {ja, en} pairs (LocalizedText).
// The type makes both languages mandatory, so adding a provider without
// its English copy is a compile error. Render with pickText(text, lang).

export const CATEGORIES: Category[] = [
  {
    key: "credit",
    label: { ja: "クレジットカード決済", en: "Credit Card Payments" },
    icon: "credit",
    description: {
      ja: "Visa / Mastercard / JCB / AMEX / Diners などのカード決済を受け付けます。",
      en: "Accept Visa, Mastercard, JCB, AMEX, Diners and other card payments.",
    },
  },
  {
    key: "qr",
    label: { ja: "QRコード決済", en: "QR Code Payments" },
    icon: "qr",
    description: {
      ja: "PayPay・au PAY・楽天ペイ・d払いなどスマホ完結のQR決済に対応します。",
      en: "Support mobile QR payments such as PayPay, au PAY, Rakuten Pay and d Payment.",
    },
  },
  {
    key: "convenience",
    label: { ja: "コンビニ決済", en: "Konbini Payments" },
    icon: "store",
    description: {
      ja: "ローソン・セブン・ファミマ等での店頭支払い、プリペイド系の決済に対応します。",
      en: "In-store payments at Lawson, 7-Eleven, FamilyMart and other konbini, plus prepaid services.",
    },
  },
  {
    key: "bank",
    label: { ja: "銀行振込決済", en: "Bank Transfer Payments" },
    icon: "bank",
    description: {
      ja: "ペイジー、バーチャル口座、ネットバンキング振込での自動消込に対応します。",
      en: "Pay-easy, virtual accounts and online banking transfers with automatic reconciliation.",
    },
  },
  {
    key: "other",
    label: { ja: "その他Webサービス決済", en: "Other Web Payment Services" },
    icon: "globe",
    description: {
      ja: "Atone・後払い.com 等の決済代行や、独自のWebhook連携を追加できます。",
      en: "Add deferred-payment PSPs such as Atone or Atobarai.com, or your own webhook integration.",
    },
  },
];

export const PROVIDERS: ProviderDefinition[] = [
  // ─────────────────────────── Credit cards ───────────────────────────
  {
    key: "stripe",
    name: { ja: "Stripe", en: "Stripe" },
    category: "credit",
    logoColor: "#635bff",
    description: {
      ja: "世界中で利用されるカード決済プラットフォーム。APIキー1組で導入できます。",
      en: "The global card payment platform. Integrate with a single pair of API keys.",
    },
    docsUrl: "https://stripe.com/docs/keys",
    supportsTestMode: true,
    fields: [
      {
        key: "publishable_key",
        label: { ja: "Publishable key", en: "Publishable key" },
        type: "text",
        required: true,
        placeholder: "pk_live_xxxxxxxxxxxx",
        helpText: {
          ja: "ダッシュボード > 開発者 > APIキー の「公開可能キー」を貼り付けます。",
          en: "Paste the publishable key from Dashboard > Developers > API keys.",
        },
      },
      {
        key: "secret_key",
        label: { ja: "Secret key", en: "Secret key" },
        type: "password",
        required: true,
        secret: true,
        placeholder: "sk_live_xxxxxxxxxxxx",
        helpText: {
          ja: "シークレットキー。サーバー側でのみ使用されます。",
          en: "Secret key, used on the server only.",
        },
      },
      {
        key: "webhook_secret",
        label: { ja: "Webhook signing secret", en: "Webhook signing secret" },
        type: "password",
        secret: true,
        placeholder: "whsec_xxxxxxxxxxxx",
        helpText: {
          ja: "Webhook受信時の署名検証に使用します。",
          en: "Used to verify signatures on incoming webhooks.",
        },
      },
      {
        key: "statement_descriptor",
        label: {
          ja: "明細表記 (statement descriptor)",
          en: "Statement descriptor",
        },
        type: "text",
        placeholder: "MYSTORE",
        helpText: {
          ja: "カード明細に表示されるストア名 (半角英数22文字以内)。",
          en: "Store name shown on card statements (max 22 alphanumeric characters).",
        },
      },
    ],
  },
  {
    key: "square",
    name: { ja: "Square", en: "Square" },
    category: "credit",
    logoColor: "#006aff",
    description: {
      ja: "リアル店舗とオンラインを統合できる決済サービス。アクセストークンで連携します。",
      en: "Unified in-person and online payments. Connects with an access token.",
    },
    docsUrl: "https://developer.squareup.com/",
    supportsTestMode: true,
    fields: [
      {
        key: "application_id",
        label: { ja: "Application ID", en: "Application ID" },
        type: "text",
        required: true,
        placeholder: "sq0idp-xxxxxxxx",
      },
      {
        key: "access_token",
        label: { ja: "Access token", en: "Access token" },
        type: "password",
        required: true,
        secret: true,
        placeholder: "EAAAEXxxxxxxxx",
      },
      {
        key: "location_id",
        label: { ja: "Location ID", en: "Location ID" },
        type: "text",
        required: true,
        placeholder: "L0XXXXXXXXXX",
        helpText: {
          ja: "決済を紐づけるロケーションID。",
          en: "The location ID payments will be attributed to.",
        },
      },
    ],
  },
  {
    key: "gmo_pg",
    name: { ja: "GMOペイメントゲートウェイ", en: "GMO Payment Gateway" },
    category: "credit",
    logoColor: "#e60012",
    description: {
      ja: "国内大手の決済代行。サイトIDとショップID、各種パスワードで接続します。",
      en: "A leading Japanese PSP. Connects with a site ID, shop ID and their passwords.",
    },
    docsUrl: "https://www.gmopg.jp/",
    supportsTestMode: true,
    fields: [
      {
        key: "site_id",
        label: { ja: "サイトID", en: "Site ID" },
        type: "text",
        required: true,
      },
      {
        key: "site_password",
        label: { ja: "サイトパスワード", en: "Site password" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "shop_id",
        label: { ja: "ショップID", en: "Shop ID" },
        type: "text",
        required: true,
      },
      {
        key: "shop_password",
        label: { ja: "ショップパスワード", en: "Shop password" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "api_endpoint",
        label: { ja: "APIエンドポイント", en: "API endpoint" },
        type: "url",
        placeholder: "https://p01.mul-pay.jp",
        helpText: {
          ja: "本番/テストで異なるエンドポイントを指定できます。",
          en: "You can point to different endpoints for live and test.",
        },
      },
    ],
  },

  // ─────────────────────────── QR code ───────────────────────────
  {
    key: "paypay",
    name: { ja: "PayPay", en: "PayPay" },
    category: "qr",
    logoColor: "#ff0033",
    description: {
      ja: "国内シェアNo.1のQR決済。Merchant IDとAPIキーで接続します。",
      en: "Japan's #1 QR payment service. Connects with a Merchant ID and API key.",
    },
    docsUrl: "https://developer.paypay.ne.jp/",
    supportsTestMode: true,
    fields: [
      {
        key: "merchant_id",
        label: { ja: "Merchant ID", en: "Merchant ID" },
        type: "text",
        required: true,
      },
      {
        // PayPay's API key is a public identifier paired with api_secret;
        // only the secret is encrypted.
        key: "api_key",
        label: { ja: "API Key", en: "API key" },
        type: "text",
        required: true,
      },
      {
        key: "api_secret",
        label: { ja: "API Secret", en: "API secret" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "store_id",
        label: { ja: "Store ID", en: "Store ID" },
        type: "text",
        helpText: {
          ja: "複数店舗を運用する場合に指定します。",
          en: "Set this when operating multiple stores.",
        },
      },
    ],
  },
  {
    key: "au_pay",
    name: { ja: "au PAY", en: "au PAY" },
    category: "qr",
    logoColor: "#ee7800",
    description: {
      ja: "au / UQ mobile ユーザーを中心に利用されるQR決済。加盟店IDとAPIキーで連携します。",
      en: "QR payments popular with au / UQ mobile users. Connects with a merchant ID and API key.",
    },
    docsUrl: "https://aupay.wallet.auone.jp/business/",
    supportsTestMode: true,
    fields: [
      {
        key: "merchant_id",
        label: { ja: "加盟店ID", en: "Merchant ID" },
        type: "text",
        required: true,
      },
      {
        key: "store_id",
        label: { ja: "店舗ID", en: "Store ID" },
        type: "text",
        required: true,
      },
      {
        // Identifier-style key (paired with api_secret); stored in plaintext by design.
        key: "api_key",
        label: { ja: "APIキー", en: "API key" },
        type: "text",
        required: true,
      },
      {
        key: "api_secret",
        label: { ja: "APIシークレット", en: "API secret" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "callback_url",
        label: { ja: "コールバックURL", en: "Callback URL" },
        type: "url",
        helpText: {
          ja: "決済結果の通知を受け取るURL (Webhook)。",
          en: "URL that receives payment result notifications (webhook).",
        },
      },
    ],
  },
  {
    key: "rakuten_pay",
    name: { ja: "楽天ペイ (オンライン)", en: "Rakuten Pay (Online)" },
    category: "qr",
    logoColor: "#bf0000",
    description: {
      ja: "楽天会員のIDで決済できる、ECサイト向けのQR/オンライン決済。",
      en: "QR / online payments for EC sites, letting customers pay with their Rakuten ID.",
    },
    docsUrl: "https://checkout.rakuten.co.jp/",
    supportsTestMode: true,
    fields: [
      {
        key: "service_id",
        label: { ja: "サービスID", en: "Service ID" },
        type: "text",
        required: true,
      },
      {
        key: "auth_key",
        label: { ja: "認証キー", en: "Auth key" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "shop_url",
        label: { ja: "ショップURL", en: "Shop URL" },
        type: "url",
      },
    ],
  },
  {
    key: "docomo_pay",
    name: { ja: "d払い", en: "d Payment" },
    category: "qr",
    logoColor: "#cc0033",
    description: {
      ja: "ドコモ回線契約者向けのQR/キャリア決済。加盟店IDとAPIキーで連携します。",
      en: "QR / carrier billing for docomo subscribers. Connects with a merchant ID and API key.",
    },
    docsUrl: "https://docomokessai.docomo.ne.jp/",
    supportsTestMode: true,
    fields: [
      {
        key: "merchant_id",
        label: { ja: "加盟店ID", en: "Merchant ID" },
        type: "text",
        required: true,
      },
      {
        key: "api_key",
        label: { ja: "APIキー", en: "API key" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "callback_url",
        label: { ja: "コールバックURL", en: "Callback URL" },
        type: "url",
        helpText: {
          ja: "決済完了時にdocomoから通知を受け取るURL。",
          en: "URL that receives completion notifications from docomo.",
        },
      },
    ],
  },

  // ─────────────────────────── Konbini ───────────────────────────
  {
    key: "bitcash",
    name: { ja: "ビットキャッシュ", en: "BitCash" },
    category: "convenience",
    logoColor: "#f7b900",
    description: {
      ja: "プリペイド型電子マネー。加盟店コードと認証キーで連携します。",
      en: "Prepaid e-money. Connects with a merchant code and auth key.",
    },
    docsUrl: "https://bitcash.jp/",
    supportsTestMode: true,
    fields: [
      {
        key: "merchant_code",
        label: { ja: "加盟店コード", en: "Merchant code" },
        type: "text",
        required: true,
      },
      {
        key: "auth_key",
        label: { ja: "認証キー", en: "Auth key" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "notify_url",
        label: { ja: "結果通知URL", en: "Result notification URL" },
        type: "url",
        helpText: {
          ja: "決済結果のPOST通知を受け取るURL。",
          en: "URL that receives POSTed payment results.",
        },
      },
    ],
  },
  {
    key: "smartpit",
    name: { ja: "スマートピット", en: "Smart Pit" },
    category: "convenience",
    logoColor: "#0091ea",
    description: {
      ja: "全国のコンビニで支払い番号を入力して決済。事業者IDと認証情報で接続します。",
      en: "Pay at any konbini nationwide with a payment number. Connects with a client ID and credentials.",
    },
    docsUrl: "https://www.smartpit.jp/",
    supportsTestMode: true,
    fields: [
      {
        key: "client_id",
        label: { ja: "事業者ID", en: "Client ID" },
        type: "text",
        required: true,
      },
      {
        key: "client_secret",
        label: { ja: "クライアントシークレット", en: "Client secret" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "expiry_days",
        label: { ja: "支払期限 (日数)", en: "Payment window (days)" },
        type: "text",
        placeholder: "14",
        helpText: {
          ja: "支払いコード発行から失効までの日数。",
          en: "Days until an issued payment code expires.",
        },
      },
    ],
  },
  {
    key: "web_conveni",
    name: { ja: "Webコンビニ決済", en: "Multi-Konbini Payment" },
    category: "convenience",
    logoColor: "#388e3c",
    description: {
      ja: "ローソン・ファミマ・ミニストップなど複数コンビニを横断して受付。",
      en: "Accept payments across multiple konbini chains — Lawson, FamilyMart, Ministop and more.",
    },
    supportsTestMode: true,
    fields: [
      {
        key: "contract_code",
        label: { ja: "契約コード", en: "Contract code" },
        type: "text",
        required: true,
      },
      {
        key: "api_token",
        label: { ja: "APIトークン", en: "API token" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "stores",
        label: { ja: "対応コンビニ", en: "Supported chains" },
        type: "select",
        options: [
          { value: "all", label: { ja: "全社対応", en: "All chains" } },
          { value: "lawson", label: { ja: "ローソンのみ", en: "Lawson only" } },
          {
            value: "familymart",
            label: { ja: "ファミリーマートのみ", en: "FamilyMart only" },
          },
          {
            value: "seven",
            label: { ja: "セブン-イレブンのみ", en: "7-Eleven only" },
          },
        ],
      },
    ],
  },

  // ─────────────────────────── Bank transfer ───────────────────────────
  {
    key: "pay_easy",
    name: { ja: "ペイジー (Pay-easy)", en: "Pay-easy" },
    category: "bank",
    logoColor: "#1565c0",
    description: {
      ja: "金融機関のATM・ネットバンキングから収納機関番号で支払いを受け付けます。",
      en: "Accept payments via bank ATMs and online banking using a collection agency number.",
    },
    supportsTestMode: true,
    fields: [
      {
        key: "collection_agency",
        label: { ja: "収納機関番号", en: "Collection agency number" },
        type: "text",
        required: true,
      },
      {
        key: "customer_number_prefix",
        label: { ja: "お客様番号プレフィックス", en: "Customer number prefix" },
        type: "text",
      },
      {
        key: "confirmation_number",
        label: { ja: "確認番号生成キー", en: "Confirmation number key" },
        type: "password",
        secret: true,
      },
    ],
  },
  {
    key: "virtual_account",
    name: {
      ja: "バーチャル口座 (GMO/SBI等)",
      en: "Virtual Account (GMO/SBI etc.)",
    },
    category: "bank",
    logoColor: "#2e7d32",
    description: {
      ja: "注文ごとに一意の振込口座を発行。自動消込と入金通知に対応します。",
      en: "Issue a unique transfer account per order, with automatic reconciliation and deposit notifications.",
    },
    supportsTestMode: true,
    fields: [
      {
        key: "bank_partner",
        label: { ja: "提携銀行", en: "Partner bank" },
        type: "select",
        required: true,
        options: [
          {
            value: "gmo_aozora",
            label: { ja: "GMOあおぞらネット銀行", en: "GMO Aozora Net Bank" },
          },
          {
            value: "sbi",
            label: { ja: "住信SBIネット銀行", en: "SBI Sumishin Net Bank" },
          },
          { value: "mizuho", label: { ja: "みずほ銀行", en: "Mizuho Bank" } },
          { value: "rakuten", label: { ja: "楽天銀行", en: "Rakuten Bank" } },
        ],
      },
      {
        key: "api_user",
        label: { ja: "API ユーザーID", en: "API user ID" },
        type: "text",
        required: true,
      },
      {
        key: "api_password",
        label: { ja: "API パスワード", en: "API password" },
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "branch_code",
        label: { ja: "支店コード", en: "Branch code" },
        type: "text",
        helpText: {
          ja: "バーチャル口座を発行する支店のコード。",
          en: "Code of the branch that issues virtual accounts.",
        },
      },
      {
        key: "webhook_url",
        label: { ja: "入金通知Webhook URL", en: "Deposit notification webhook URL" },
        type: "url",
      },
    ],
  },

  // ─────────────────────────── Other ───────────────────────────
  {
    key: "custom_webhook",
    name: { ja: "カスタムWebhook連携", en: "Custom Webhook" },
    category: "other",
    logoColor: "#546e7a",
    description: {
      ja: "未対応の決済サービスを、HTTP APIとWebhookで自由に連携できます。",
      en: "Integrate any unsupported payment service with an HTTP API and webhooks.",
    },
    supportsTestMode: false,
    fields: [
      {
        key: "service_name",
        label: { ja: "サービス名", en: "Service name" },
        type: "text",
        required: true,
      },
      {
        key: "endpoint",
        label: { ja: "API エンドポイント", en: "API endpoint" },
        type: "url",
        required: true,
      },
      {
        key: "auth_header",
        label: { ja: "Authorization ヘッダ", en: "Authorization header" },
        type: "password",
        secret: true,
        placeholder: "Bearer xxxxxxxxxx",
      },
      {
        key: "webhook_secret",
        label: { ja: "Webhook 検証シークレット", en: "Webhook verification secret" },
        type: "password",
        secret: true,
      },
      {
        key: "notes",
        label: { ja: "メモ", en: "Notes" },
        type: "textarea",
      },
    ],
  },
];

export function getCategory(key: string): Category | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

export function getProviderDefinition(
  key: string,
): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.key === key);
}

export function providersByCategory(category: string): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.category === category);
}
