// Backfill (Phase M-1): link transactions created before the customer master
// existed to Customer rows (idempotent). The seed runs the same function, so
// this script is only needed on databases that are not re-seeded.
//   npm run db:link-customers

import { prisma } from "../lib/db";
import { linkExistingPayments } from "../lib/customers/service";

linkExistingPayments(prisma)
  .then((r) => console.log(`linked ${r.linked} transaction(s), created ${r.customers} customer(s)`))
  .finally(() => prisma.$disconnect());
