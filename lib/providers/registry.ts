import type { Category, ProviderDefinition } from "./types";

export const CATEGORIES: Category[] = [
  {
    key: "credit",
    label: "クレジットカード決済",
    icon: "credit",
    description:
      "Visa / Mastercard / JCB / AMEX / Diners などのカード決済を受け付けます。",
  },
  {
    key: "qr",
    label: "QRコード決済",
    icon: "qr",
    description:
      "PayPay・LINE Pay・楽天ペイ・d払いなどスマホ完結のQR決済に対応します。",
  },
  {
    key: "convenience",
    label: "コンビニ決済",
    icon: "store",
    description:
      "ローソン・セブン・ファミマ等での店頭支払い、プリペイド系の決済に対応します。",
  },
  {
    key: "bank",
    label: "銀行振込決済",
    icon: "bank",
    description:
      "ペイジー、バーチャル口座、ネットバンキング振込での自動消込に対応します。",
  },
  {
    key: "other",
    label: "その他Webサービス決済",
    icon: "globe",
    description:
      "Atone・後払い.com 等の決済代行や、独自のWebhook連携を追加できます。",
  },
];

export const PROVIDERS: ProviderDefinition[] = [
  // ─────────────────────────── クレジットカード ───────────────────────────
  {
    key: "stripe",
    name: "Stripe",
    category: "credit",
    logoColor: "#635bff",
    description:
      "世界中で利用されるカード決済プラットフォーム。APIキー1組で導入できます。",
    docsUrl: "https://stripe.com/docs/keys",
    supportsTestMode: true,
    fields: [
      {
        key: "publishable_key",
        label: "Publishable key",
        type: "text",
        required: true,
        placeholder: "pk_live_xxxxxxxxxxxx",
        helpText: "ダッシュボード > 開発者 > APIキー の「公開可能キー」を貼り付けます。",
      },
      {
        key: "secret_key",
        label: "Secret key",
        type: "password",
        required: true,
        secret: true,
        placeholder: "sk_live_xxxxxxxxxxxx",
        helpText: "シークレットキー。サーバー側でのみ使用されます。",
      },
      {
        key: "webhook_secret",
        label: "Webhook signing secret",
        type: "password",
        secret: true,
        placeholder: "whsec_xxxxxxxxxxxx",
        helpText: "Webhook受信時の署名検証に使用します。",
      },
      {
        key: "statement_descriptor",
        label: "明細表記 (statement descriptor)",
        type: "text",
        placeholder: "MYSTORE",
        helpText: "カード明細に表示されるストア名 (半角英数22文字以内)。",
      },
    ],
  },
  {
    key: "square",
    name: "Square",
    category: "credit",
    logoColor: "#006aff",
    description:
      "リアル店舗とオンラインを統合できる決済サービス。アクセストークンで連携します。",
    docsUrl: "https://developer.squareup.com/",
    supportsTestMode: true,
    fields: [
      {
        key: "application_id",
        label: "Application ID",
        type: "text",
        required: true,
        placeholder: "sq0idp-xxxxxxxx",
      },
      {
        key: "access_token",
        label: "Access token",
        type: "password",
        required: true,
        secret: true,
        placeholder: "EAAAEXxxxxxxxx",
      },
      {
        key: "location_id",
        label: "Location ID",
        type: "text",
        required: true,
        placeholder: "L0XXXXXXXXXX",
        helpText: "決済を紐づけるロケーションID。",
      },
    ],
  },
  {
    key: "gmo_pg",
    name: "GMOペイメントゲートウェイ",
    category: "credit",
    logoColor: "#e60012",
    description:
      "国内大手の決済代行。サイトIDとショップID、各種パスワードで接続します。",
    docsUrl: "https://www.gmopg.jp/",
    supportsTestMode: true,
    fields: [
      { key: "site_id", label: "サイトID", type: "text", required: true },
      {
        key: "site_password",
        label: "サイトパスワード",
        type: "password",
        required: true,
        secret: true,
      },
      { key: "shop_id", label: "ショップID", type: "text", required: true },
      {
        key: "shop_password",
        label: "ショップパスワード",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "api_endpoint",
        label: "APIエンドポイント",
        type: "url",
        placeholder: "https://p01.mul-pay.jp",
        helpText: "本番/テストで異なるエンドポイントを指定できます。",
      },
    ],
  },

  // ─────────────────────────── QRコード ───────────────────────────
  {
    key: "paypay",
    name: "PayPay",
    category: "qr",
    logoColor: "#ff0033",
    description: "国内シェアNo.1のQR決済。Merchant IDとAPIキーで接続します。",
    docsUrl: "https://developer.paypay.ne.jp/",
    supportsTestMode: true,
    fields: [
      { key: "merchant_id", label: "Merchant ID", type: "text", required: true },
      { key: "api_key", label: "API Key", type: "text", required: true },
      {
        key: "api_secret",
        label: "API Secret",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "store_id",
        label: "Store ID",
        type: "text",
        helpText: "複数店舗を運用する場合に指定します。",
      },
    ],
  },
  {
    key: "line_pay",
    name: "LINE Pay",
    category: "qr",
    logoColor: "#06c755",
    description: "LINEユーザー向けのQR決済。Channel ID / Secret Keyで接続します。",
    docsUrl: "https://pay.line.me/developers/documentation/",
    supportsTestMode: true,
    fields: [
      { key: "channel_id", label: "Channel ID", type: "text", required: true },
      {
        key: "channel_secret",
        label: "Channel Secret Key",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "region",
        label: "リージョン",
        type: "select",
        options: [
          { value: "JP", label: "日本 (JP)" },
          { value: "TW", label: "台湾 (TW)" },
          { value: "TH", label: "タイ (TH)" },
        ],
        required: true,
      },
    ],
  },
  {
    key: "rakuten_pay",
    name: "楽天ペイ (オンライン)",
    category: "qr",
    logoColor: "#bf0000",
    description:
      "楽天会員のIDで決済できる、ECサイト向けのQR/オンライン決済。",
    docsUrl: "https://checkout.rakuten.co.jp/",
    supportsTestMode: true,
    fields: [
      { key: "service_id", label: "サービスID", type: "text", required: true },
      {
        key: "auth_key",
        label: "認証キー",
        type: "password",
        required: true,
        secret: true,
      },
      { key: "shop_url", label: "ショップURL", type: "url" },
    ],
  },
  {
    key: "docomo_pay",
    name: "d払い",
    category: "qr",
    logoColor: "#cc0033",
    description:
      "ドコモ回線契約者向けのQR/キャリア決済。加盟店IDとAPIキーで連携します。",
    docsUrl: "https://docomokessai.docomo.ne.jp/",
    supportsTestMode: true,
    fields: [
      { key: "merchant_id", label: "加盟店ID", type: "text", required: true },
      {
        key: "api_key",
        label: "APIキー",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "callback_url",
        label: "コールバックURL",
        type: "url",
        helpText: "決済完了時にdocomoから通知を受け取るURL。",
      },
    ],
  },

  // ─────────────────────────── コンビニ ───────────────────────────
  {
    key: "bitcash",
    name: "ビットキャッシュ",
    category: "convenience",
    logoColor: "#f7b900",
    description:
      "プリペイド型電子マネー。加盟店コードと認証キーで連携します。",
    docsUrl: "https://bitcash.jp/",
    supportsTestMode: true,
    fields: [
      { key: "merchant_code", label: "加盟店コード", type: "text", required: true },
      {
        key: "auth_key",
        label: "認証キー",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "notify_url",
        label: "結果通知URL",
        type: "url",
        helpText: "決済結果のPOST通知を受け取るURL。",
      },
    ],
  },
  {
    key: "smartpit",
    name: "スマートピット",
    category: "convenience",
    logoColor: "#0091ea",
    description:
      "全国のコンビニで支払い番号を入力して決済。事業者IDと認証情報で接続します。",
    docsUrl: "https://www.smartpit.jp/",
    supportsTestMode: true,
    fields: [
      { key: "client_id", label: "事業者ID", type: "text", required: true },
      {
        key: "client_secret",
        label: "クライアントシークレット",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "expiry_days",
        label: "支払期限 (日数)",
        type: "text",
        placeholder: "14",
        helpText: "支払いコード発行から失効までの日数。",
      },
    ],
  },
  {
    key: "web_conveni",
    name: "Webコンビニ決済",
    category: "convenience",
    logoColor: "#388e3c",
    description:
      "ローソン・ファミマ・ミニストップなど複数コンビニを横断して受付。",
    supportsTestMode: true,
    fields: [
      { key: "contract_code", label: "契約コード", type: "text", required: true },
      {
        key: "api_token",
        label: "APIトークン",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "stores",
        label: "対応コンビニ",
        type: "select",
        options: [
          { value: "all", label: "全社対応" },
          { value: "lawson", label: "ローソンのみ" },
          { value: "familymart", label: "ファミリーマートのみ" },
          { value: "seven", label: "セブン-イレブンのみ" },
        ],
      },
    ],
  },

  // ─────────────────────────── 銀行振込 ───────────────────────────
  {
    key: "pay_easy",
    name: "ペイジー (Pay-easy)",
    category: "bank",
    logoColor: "#1565c0",
    description:
      "金融機関のATM・ネットバンキングから収納機関番号で支払いを受け付けます。",
    supportsTestMode: true,
    fields: [
      { key: "collection_agency", label: "収納機関番号", type: "text", required: true },
      { key: "customer_number_prefix", label: "お客様番号プレフィックス", type: "text" },
      {
        key: "confirmation_number",
        label: "確認番号生成キー",
        type: "password",
        secret: true,
      },
    ],
  },
  {
    key: "virtual_account",
    name: "バーチャル口座 (GMO/SBI等)",
    category: "bank",
    logoColor: "#2e7d32",
    description:
      "注文ごとに一意の振込口座を発行。自動消込と入金通知に対応します。",
    supportsTestMode: true,
    fields: [
      {
        key: "bank_partner",
        label: "提携銀行",
        type: "select",
        required: true,
        options: [
          { value: "gmo_aozora", label: "GMOあおぞらネット銀行" },
          { value: "sbi", label: "住信SBIネット銀行" },
          { value: "mizuho", label: "みずほ銀行" },
          { value: "rakuten", label: "楽天銀行" },
        ],
      },
      { key: "api_user", label: "API ユーザーID", type: "text", required: true },
      {
        key: "api_password",
        label: "API パスワード",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "branch_code",
        label: "支店コード",
        type: "text",
        helpText: "バーチャル口座を発行する支店のコード。",
      },
      {
        key: "webhook_url",
        label: "入金通知Webhook URL",
        type: "url",
      },
    ],
  },

  // ─────────────────────────── その他 ───────────────────────────
  {
    key: "custom_webhook",
    name: "カスタムWebhook連携",
    category: "other",
    logoColor: "#546e7a",
    description:
      "未対応の決済サービスを、HTTP APIとWebhookで自由に連携できます。",
    supportsTestMode: false,
    fields: [
      { key: "service_name", label: "サービス名", type: "text", required: true },
      { key: "endpoint", label: "API エンドポイント", type: "url", required: true },
      {
        key: "auth_header",
        label: "Authorization ヘッダ",
        type: "password",
        secret: true,
        placeholder: "Bearer xxxxxxxxxx",
      },
      {
        key: "webhook_secret",
        label: "Webhook 検証シークレット",
        type: "password",
        secret: true,
      },
      {
        key: "notes",
        label: "メモ",
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
