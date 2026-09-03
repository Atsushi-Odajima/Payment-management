import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { langFromRequest } from "@/lib/i18n";
import { buildOpenApiSpec } from "@/lib/public-api/openapi";
import { appBaseUrl } from "@/lib/webhooks/deliver";

/** GET /api/v1/openapi.json — the OpenAPI 3 document (public, `?lang=ja|en` for the descriptions). */
export const GET = withApiHandler(
  async (req) => {
    const url = new URL(req.url);
    const lang = url.searchParams.get("lang") === "ja" ? "ja" : url.searchParams.get("lang") === "en" ? "en" : langFromRequest(req);
    return NextResponse.json(buildOpenApiSpec(appBaseUrl(), lang), { headers: { "cache-control": "public, max-age=300" } });
  },
  { ipRestricted: false },
);
