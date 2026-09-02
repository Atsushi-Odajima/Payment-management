import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { seed, truncateAll } from "@/prisma/seed-data";
import { timingSafeEqualBytes } from "@/lib/auth";

/**
 * Reset the demo database to the seed state.
 *
 * Protected by CRON_SECRET (Vercel Cron sends `Authorization: Bearer <secret>`
 * automatically). Disabled entirely when CRON_SECRET is not set.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(404, "not_found", "errors.notFound");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
    throw new ApiError(401, "unauthorized", "errors.unauthorized");
  }
  await truncateAll(prisma);
  await seed(prisma);
  return ok({ reset: true });
}

export const GET = withApiHandler(handle);
export const POST = withApiHandler(handle);
