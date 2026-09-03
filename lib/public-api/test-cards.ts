// Test card numbers of the public API (Phase L-3). In test mode a card number
// selects a scenario; any other Luhn-valid number succeeds. In live mode the
// test numbers are refused (test_card_in_live) — the demo has no card network,
// so a live card simply follows the normal flow.

import type { CardBrand } from "@/lib/risk/types";

export type TestCardOutcome = "success" | "authorized_only" | "declined" | "insufficient_funds" | "expired_card" | "incorrect_cvc" | "processing_error";

export interface TestCard {
  number: string;
  outcome: TestCardOutcome;
  /** Payment.failureReason recorded for failure scenarios. */
  failureReason: string | null;
  description: { ja: string; en: string };
}

export const TEST_CARDS: readonly TestCard[] = [
  { number: "4242424242424242", outcome: "success", failureReason: null, description: { ja: "成功（与信 → 売上確定）", en: "Success (authorized and captured)" } },
  { number: "5555555555554444", outcome: "success", failureReason: null, description: { ja: "成功（Mastercard）", en: "Success (Mastercard)" } },
  { number: "3566002020360505", outcome: "success", failureReason: null, description: { ja: "成功（JCB）", en: "Success (JCB)" } },
  { number: "4000000000003220", outcome: "authorized_only", failureReason: null, description: { ja: "3D セキュア相当: 与信済で止まり、管理画面またはキャプチャで完了", en: "3-D Secure style: stops at authorized; complete from the dashboard" } },
  { number: "4000000000000002", outcome: "declined", failureReason: "card_declined", description: { ja: "カード会社による拒否", en: "Declined by the issuer" } },
  { number: "4000000000009995", outcome: "insufficient_funds", failureReason: "insufficient_funds", description: { ja: "残高不足", en: "Insufficient funds" } },
  { number: "4000000000000069", outcome: "expired_card", failureReason: "expired_card", description: { ja: "有効期限切れ", en: "Expired card" } },
  { number: "4000000000000127", outcome: "incorrect_cvc", failureReason: "incorrect_cvc", description: { ja: "セキュリティコード不一致", en: "Incorrect CVC" } },
  { number: "4000000000000119", outcome: "processing_error", failureReason: "processing_error", description: { ja: "決済ネットワークの処理エラー", en: "Processing error at the network" } },
];

export function luhnValid(number: string): boolean {
  if (!/^\d{13,19}$/.test(number)) return false;
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = Number(number[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function cardBrandOf(number: string): CardBrand {
  if (/^4/.test(number)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(number)) return "mastercard";
  if (/^35/.test(number)) return "jcb";
  if (/^3[47]/.test(number)) return "amex";
  if (/^3[068]/.test(number)) return "diners";
  return "visa";
}

export function findTestCard(number: string): TestCard | null {
  return TEST_CARDS.find((c) => c.number === number) ?? null;
}
