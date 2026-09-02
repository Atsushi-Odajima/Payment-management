import { PrismaClient } from "@prisma/client";
import { seed } from "./seed-data";

const prisma = new PrismaClient();

seed(prisma, { force: process.env.SEED_FORCE === "1" })
  .then(({ skipped }) => {
    console.log(skipped ? "Already seeded — skipping." : "Seed complete: 2 providers, 3 payments, 3 merchants.");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
