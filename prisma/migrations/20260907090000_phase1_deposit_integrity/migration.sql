-- AlterTable
ALTER TABLE "SettlementBatch" ADD COLUMN "invoiceNo" TEXT;

-- CreateTable
CREATE TABLE "DepositNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationNo" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "claimKey" TEXT,
    "duplicateOfId" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "transferId" TEXT,
    "cvsReceiptNo" TEXT,
    "amount" INTEGER NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "payerName" TEXT,
    "bankReference" TEXT,
    "result" TEXT NOT NULL,
    "resultReason" TEXT,
    "paymentId" TEXT,
    "unmatchedDepositId" TEXT,
    "rawBody" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DepositNotification_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UnmatchedDeposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "payerName" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "bankReference" TEXT,
    "givenTransferId" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "reason" TEXT,
    "candidatePaymentId" TEXT,
    "paymentId" TEXT,
    "matchedTransferId" TEXT,
    "matchedById" TEXT,
    "matchedAt" DATETIME,
    "dismissKind" TEXT,
    "dismissReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnmatchedDeposit_candidatePaymentId_fkey" FOREIGN KEY ("candidatePaymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UnmatchedDeposit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_UnmatchedDeposit" ("amount", "bankReference", "createdAt", "dismissReason", "givenTransferId", "id", "livemode", "matchedAt", "matchedById", "matchedTransferId", "note", "payerName", "paymentId", "receivedAt", "source", "status", "updatedAt") SELECT "amount", "bankReference", "createdAt", "dismissReason", "givenTransferId", "id", "livemode", "matchedAt", "matchedById", "matchedTransferId", "note", "payerName", "paymentId", "receivedAt", "source", "status", "updatedAt" FROM "UnmatchedDeposit";
DROP TABLE "UnmatchedDeposit";
ALTER TABLE "new_UnmatchedDeposit" RENAME TO "UnmatchedDeposit";
CREATE INDEX "UnmatchedDeposit_status_idx" ON "UnmatchedDeposit"("status");
CREATE INDEX "UnmatchedDeposit_livemode_idx" ON "UnmatchedDeposit"("livemode");
CREATE INDEX "UnmatchedDeposit_receivedAt_idx" ON "UnmatchedDeposit"("receivedAt");
CREATE INDEX "UnmatchedDeposit_paymentId_idx" ON "UnmatchedDeposit"("paymentId");
CREATE INDEX "UnmatchedDeposit_candidatePaymentId_idx" ON "UnmatchedDeposit"("candidatePaymentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DepositNotification_notificationNo_key" ON "DepositNotification"("notificationNo");

-- CreateIndex
CREATE UNIQUE INDEX "DepositNotification_claimKey_key" ON "DepositNotification"("claimKey");

-- CreateIndex
CREATE INDEX "DepositNotification_dedupeKey_idx" ON "DepositNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "DepositNotification_source_result_idx" ON "DepositNotification"("source", "result");

-- CreateIndex
CREATE INDEX "DepositNotification_transferId_idx" ON "DepositNotification"("transferId");

-- CreateIndex
CREATE INDEX "DepositNotification_cvsReceiptNo_idx" ON "DepositNotification"("cvsReceiptNo");

-- CreateIndex
CREATE INDEX "DepositNotification_paymentId_idx" ON "DepositNotification"("paymentId");

-- CreateIndex
CREATE INDEX "DepositNotification_createdAt_idx" ON "DepositNotification"("createdAt");

-- CreateIndex
CREATE INDEX "DepositNotification_livemode_idx" ON "DepositNotification"("livemode");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatch_invoiceNo_key" ON "SettlementBatch"("invoiceNo");


-- Data migration (Phase P1-6): konbini slips waiting for payment get their own status.
UPDATE "Payment" SET "status" = 'awaiting_payment' WHERE "status" = 'pending' AND "cvsReceiptNo" IS NOT NULL;
