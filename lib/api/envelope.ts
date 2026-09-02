// Response envelope shared by Route Handlers (Node) and middleware (Edge).
// Keep this file free of Node-only imports.

import { translate, type Lang, type MessageKey, type MessageParams } from "@/lib/i18n";

export type ApiOk<T> = { ok: true; data: T };
export type ApiFail = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResult<T> = ApiOk<T> | ApiFail;

export type ErrorKey = Extract<MessageKey, `errors.${string}`>;

export function failBody(
  lang: Lang,
  code: string,
  messageKey: ErrorKey,
  params?: MessageParams,
  details?: unknown,
): ApiFail {
  return {
    ok: false,
    error: {
      code,
      message: translate(lang, messageKey, params),
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function failResponse(
  lang: Lang,
  status: number,
  code: string,
  messageKey: ErrorKey,
  params?: MessageParams,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(failBody(lang, code, messageKey, params)), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
