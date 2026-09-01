import { pickText, translate, type Lang } from "@/lib/i18n";
import { getProviderDefinition } from "./registry";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * Validates that all required credentials are present for the given provider
 * and returns a friendly diagnosis in the requested language. In demo mode
 * this does NOT call external APIs — it only verifies that the form was
 * filled out. Replace this function with real provider SDK calls when going
 * live.
 */
export function runConnectionTest(
  providerKey: string,
  credentials: Record<string, string | undefined>,
  testMode: boolean,
  lang: Lang,
): ConnectionTestResult {
  const def = getProviderDefinition(providerKey);
  if (!def) {
    return { ok: false, message: translate(lang, "errors.unsupportedProvider") };
  }
  const missing: string[] = [];
  for (const field of def.fields) {
    if (field.required && !credentials[field.key]) {
      missing.push(pickText(field.label, lang));
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      message: translate(lang, "errors.missingRequired", {
        fields: missing.join(", "),
      }),
    };
  }
  // Cheap shape validation for credential-looking fields.
  for (const field of def.fields) {
    const v = credentials[field.key];
    if (!v) continue;
    if (field.type === "url" && !/^https?:\/\//i.test(v)) {
      return {
        ok: false,
        message: translate(lang, "errors.invalidUrl", {
          field: pickText(field.label, lang),
        }),
      };
    }
  }
  return {
    ok: true,
    message: translate(lang, "connection.ok", {
      name: pickText(def.name, lang),
      mode: translate(lang, testMode ? "common.testMode" : "common.liveMode"),
    }),
  };
}
