-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "cardHash" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cardLast4" TEXT;
ALTER TABLE "Payment" ADD COLUMN "clientIp" TEXT;
ALTER TABLE "Payment" ADD COLUMN "depositDiffStatus" TEXT;

-- CreateTable
CREATE TABLE "RiskSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "windowMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxFailures" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Blacklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Blacklist_status_kind_idx" ON "Blacklist"("status", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Blacklist_kind_value_key" ON "Blacklist"("kind", "value");

-- CreateIndex
CREATE INDEX "Payment_cardHash_idx" ON "Payment"("cardHash");

-- CreateIndex
CREATE INDEX "Payment_clientIp_idx" ON "Payment"("clientIp");

-- CreateIndex
CREATE INDEX "Payment_depositDiffStatus_idx" ON "Payment"("depositDiffStatus");
