// Resets the local demo database: deletes every row and re-runs the seed.
//   npm run db:reset
// Same effect as POST /api/demo/reset, without needing CRON_SECRET or a server.

import { PrismaClient } from "@prisma/client";
import { seed, truncateAll } from "../prisma/seed-data";

async function main() {
  const prisma = new PrismaClient();
  try {
    await truncateAll(prisma);
    const summary = await seed(prisma);
    console.log("Demo database reset:", summary);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
