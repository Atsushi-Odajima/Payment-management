import { MerchantSandboxView } from "@/components/views/merchant/sandbox-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { PUBLIC_API_ENDPOINTS } from "@/lib/public-api/openapi";
import { TEST_CARDS } from "@/lib/public-api/test-cards";

export const dynamic = "force-dynamic";

/** Sandbox console (Phase L-3): calls the real /api/v1 with the merchant's own test key. */
export default async function MerchantSandboxPage() {
  await requireMerchantPage();
  const endpoints = PUBLIC_API_ENDPOINTS.map((e) => ({ operationId: e.operationId, method: e.method, path: e.path, summary: e.summary, hasBody: Boolean(e.requestBody), pathParams: (e.pathParams ?? []).map((p) => p.name), example: e.requestBody ? exampleFor(e.operationId) : null }));
  return <MerchantSandboxView endpoints={endpoints} testCards={TEST_CARDS.map((c) => ({ number: c.number, description: c.description }))} />;
}

function exampleFor(operationId: string): Record<string, unknown> {
  switch (operationId) {
    case "createTransaction":
      return { method: "credit", orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`, amount: 4980, productName: "Sandbox order", customerName: "Taro Yamada", customerEmail: "taro@example.com", card: { number: "4242424242424242", expMonth: 12, expYear: 2028 } };
    case "createRefund":
      return { transactionId: "<transaction id>", amount: 1000, reasonCode: "customer" };
    case "createPaymentLink":
      return { productName: "Sandbox product", amount: 3200, maxUses: 10 };
    default:
      return {};
  }
}
