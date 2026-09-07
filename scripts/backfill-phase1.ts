// npm run db:backfill — apply the Phase P1 data backfill to the configured
// database (safe to re-run). See lib/maintenance/phase1-backfill.ts.

import { PrismaClient } from "@prisma/client";
import { runPhase1Backfill } from "../lib/maintenance/phase1-backfill";

const prisma = new PrismaClient();

async function main() {
  const summary = await runPhase1Backfill(prisma);
  console.log(`konbini slips → awaiting_payment: ${summary.awaitingPayment}`);
  console.log(`invoice numbers assigned: ${summary.invoiceNumbers}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
