-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "merchantId" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'partial',
    "reasonCode" TEXT NOT NULL DEFAULT 'other',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "forced" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "decisionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Refund_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Refund" ("amount", "createdAt", "id", "paymentId", "reason") SELECT "amount", "createdAt", "id", "paymentId", "reason" FROM "Refund";
DROP TABLE "Refund";
ALTER TABLE "new_Refund" RENAME TO "Refund";
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");
CREATE INDEX "Refund_merchantId_idx" ON "Refund"("merchantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
