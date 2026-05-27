import { getProviderDefinition } from "./registry";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * Validates that all required credentials are present for the given provider
 * and returns a friendly diagnosis. In demo mode this does NOT call external
 * APIs — it only verifies that the form was filled out. Replace this function
 * with real provider SDK calls when going live.
 */
export function runConnectionTest(
  providerKey: string,
  credentials: Record<string, string | undefined>,
  testMode: boolean,
): ConnectionTestResult {
  const def = getProviderDefinition(providerKey);
  if (!def) {
    return { ok: false, message: "未対応のプロバイダです" };
  }
  const missing: string[] = [];
  for (const field of def.fields) {
    if (field.required && !credentials[field.key]) missing.push(field.label);
  }
  if (missing.length > 0) {
    return {
      ok: false,
      message: `必須項目が未入力です: ${missing.join(", ")}`,
    };
  }
  // Cheap shape validation for credential-looking fields.
  for (const field of def.fields) {
    const v = credentials[field.key];
    if (!v) continue;
    if (field.type === "url" && !/^https?:\/\//i.test(v)) {
      return {
        ok: false,
        message: `${field.label} はURL形式で入力してください`,
      };
    }
  }
  const modeLabel = testMode ? "テストモード" : "本番モード";
  return {
    ok: true,
    message: `${def.name} (${modeLabel}) への接続情報を確認しました。デモ環境のため、実APIは呼び出していません。`,
  };
}
