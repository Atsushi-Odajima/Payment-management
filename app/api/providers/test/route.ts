import { NextResponse } from "next/server";
import { z } from "zod";
import { runConnectionTest } from "@/lib/providers/connection";
import { langFromRequest, translate } from "@/lib/i18n";

const Schema = z.object({
  providerKey: z.string(),
  credentials: z.record(z.string(), z.string().optional()).default({}),
  testMode: z.boolean().default(true),
});

export async function POST(req: Request) {
  const lang = langFromRequest(req);
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: translate(lang, "errors.checkInput") },
      { status: 400 },
    );
  }
  const result = runConnectionTest(
    parsed.data.providerKey,
    parsed.data.credentials,
    parsed.data.testMode,
    lang,
  );
  return NextResponse.json(result);
}
