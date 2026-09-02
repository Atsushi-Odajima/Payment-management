-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "feeRate" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationCode" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewerNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentApplication_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IpRestriction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target" TEXT NOT NULL,
    "merchantId" TEXT,
    "cidr" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IpRestriction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantCode" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "siteNameKana" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "statementEmail" TEXT NOT NULL,
    "notifyUrl" TEXT NOT NULL,
    "notifyFormat" TEXT NOT NULL DEFAULT 'json_post',
    "notifyParamSet" TEXT NOT NULL DEFAULT 'standard',
    "notifyIdFormat" TEXT NOT NULL DEFAULT 'payment_id',
    "emailNotification" TEXT NOT NULL DEFAULT 'per_payment',
    "agentId" TEXT,
    "enabledMethods" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Merchant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Merchant" ("companyName", "contactName", "createdAt", "email", "emailNotification", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "siteName", "siteNameKana", "statementEmail", "updatedAt") SELECT "companyName", "contactName", "createdAt", "email", "emailNotification", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "siteName", "siteNameKana", "statementEmail", "updatedAt" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_merchantCode_key" ON "Merchant"("merchantCode");
CREATE INDEX "Merchant_createdAt_idx" ON "Merchant"("createdAt");
CREATE INDEX "Merchant_agentId_idx" ON "Merchant"("agentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentCode_key" ON "Agent"("agentCode");

-- CreateIndex
CREATE INDEX "Agent_createdAt_idx" ON "Agent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentApplication_applicationCode_key" ON "PaymentApplication"("applicationCode");

-- CreateIndex
CREATE INDEX "PaymentApplication_status_appliedAt_idx" ON "PaymentApplication"("status", "appliedAt");

-- CreateIndex
CREATE INDEX "PaymentApplication_merchantId_idx" ON "PaymentApplication"("merchantId");

-- CreateIndex
CREATE INDEX "IpRestriction_target_enabled_idx" ON "IpRestriction"("target", "enabled");

-- CreateIndex
CREATE INDEX "IpRestriction_merchantId_idx" ON "IpRestriction"("merchantId");
