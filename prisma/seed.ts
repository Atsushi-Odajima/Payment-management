import { PrismaClient } from "@prisma/client";
import { seed } from "./seed-data";

const prisma = new PrismaClient();

seed(prisma)
  .then((s) => {
    console.log(
      `Seed ensured: ${s.providers} providers, ${s.payments} transactions, ${s.merchants} merchants, ${s.agents} agents, ${s.ipRestrictions} IP rules (existing rows untouched).`,
    );
  })
  .catch((e: unknown) => {
    console.error(e);
    // The seed encrypts demo credentials and merchant passwords, so it is the
    // first place a bad ENCRYPTION_KEY surfaces during a Vercel build.
    if (e instanceof Error && e.name === "EncryptionKeyError") {
      console.error(
        [
          "",
          "[seed] ENCRYPTION_KEY is missing or not a base64-encoded 32-byte value.",
          "       Set it in the deployment environment (Vercel: Settings → Environment Variables,",
          "       Production + Preview) to a value generated with:",
          "         node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
          "       (44 characters ending with \"=\"; no quotes or trailing spaces), then redeploy.",
          "       Credentials encrypted with a previous key are reset by POST /api/demo/reset",
          "       or the daily cron.",
          "",
        ].join("\n"),
      );
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
