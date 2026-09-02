// Unified API response envelope and error mapping for Route Handlers.
//
//   success: { ok: true,  data: T }
//   failure: { ok: false, error: { code, message, details? } }
//
// Route handlers throw ApiError (or let Zod / Prisma / crypto errors bubble)
// and withApiHandler turns them into localized JSON responses. It also
// applies the admin IP block list (lib/ip-restrictions/enforce.ts) unless the
// route opts out because it is not admin traffic (webhooks, demo endpoints).

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { DecryptionError, EncryptionKeyError } from "@/lib/crypto";
import { langFromRequest, type Lang, type MessageParams } from "@/lib/i18n";
import { checkAdminAccess } from "@/lib/ip-restrictions/enforce";
import { failBody, type ApiFail, type ApiOk, type ErrorKey } from "./envelope";

export type { ApiFail, ApiOk, ApiResult } from "./envelope";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly messageKey: ErrorKey,
    public readonly params?: MessageParams,
    public readonly details?: unknown,
  ) {
    super(messageKey);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiOk<T>> {
  return NextResponse.json({ ok: true as const, data }, init);
}

export function fail(
  lang: Lang,
  status: number,
  code: string,
  messageKey: ErrorKey,
  params?: MessageParams,
  details?: unknown,
): NextResponse<ApiFail> {
  return NextResponse.json(failBody(lang, code, messageKey, params, details), { status });
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response> | Response;

export interface HandlerOptions {
  /**
   * Apply the admin IP block list (default true). Set false for endpoints
   * that are called by third parties — PSP webhooks, the bank deposit
   * notification, the cron reset — which authenticate on their own.
   */
  ipRestricted?: boolean;
}

/**
 * Wrap a Route Handler so every thrown error becomes a consistent, localized
 * JSON failure envelope instead of a text/plain 500.
 */
export function withApiHandler<Ctx = unknown>(handler: Handler<Ctx>, options: HandlerOptions = {}): Handler<Ctx> {
  const ipRestricted = options.ipRestricted ?? true;
  return async (req, ctx) => {
    const lang = langFromRequest(req);
    try {
      if (ipRestricted) {
        const access = await checkAdminAccess((n) => req.headers.get(n));
        if (access.blocked) {
          throw new ApiError(403, "ip_blocked", "errors.ipBlocked", { ip: access.ip ?? "" });
        }
      }
      return await handler(req, ctx);
    } catch (err) {
      return errorToResponse(err, lang);
    }
  };
}

export function errorToResponse(err: unknown, lang: Lang): NextResponse<ApiFail> {
  if (err instanceof ApiError) {
    return fail(lang, err.status, err.code, err.messageKey, err.params, err.details);
  }
  if (err instanceof ZodError) {
    return fail(lang, 400, "invalid_input", "errors.invalidInput", undefined, err.flatten());
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2025":
        return fail(lang, 404, "not_found", "errors.notFound");
      case "P2002":
      case "P2003":
        return fail(lang, 409, "conflict", "errors.conflict");
    }
  }
  if (err instanceof EncryptionKeyError) {
    console.error("[api] encryption key error:", err.message);
    return fail(lang, 500, "encryption_key", "errors.encryptionKey");
  }
  if (err instanceof DecryptionError) {
    return fail(lang, 422, "undecryptable", "errors.undecryptable");
  }
  console.error("[api] unhandled error:", err);
  return fail(lang, 500, "internal", "errors.internal");
}

/** Parse a JSON body, mapping malformed JSON to a 400. Empty body → {}. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "errors.invalidInput");
  }
}
