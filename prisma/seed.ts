import { PrismaClient } from "@prisma/client";
import { seed } from "./seed-data";

const prisma = new PrismaClient();

seed(prisma)
  .then((s) => {
    console.log(
      `Seed ensured: ${s.providers} providers, ${s.payments} payments, ${s.merchants} merchants, ${s.agents} agents, ${s.applications} applications, ${s.ipRestrictions} IP rules (existing rows untouched).`,
    );
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
