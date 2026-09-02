import { z } from "zod";
import { ok, readJson, withApiHandler } from "@/lib/api/handler";
import { runConnectionTest } from "@/lib/providers/connection";
import { langFromRequest } from "@/lib/i18n";

const Schema = z.object({
  providerKey: z.string(),
  credentials: z.record(z.string(), z.string().optional()).default({}),
  testMode: z.boolean().default(true),
});

/** Ephemeral connection test against unsaved form values. */
export const POST = withApiHandler(async (req) => {
  const lang = langFromRequest(req);
  const body = Schema.parse(await readJson(req));
  const result = runConnectionTest(body.providerKey, body.credentials, body.testMode, lang);
  return ok(result);
});
