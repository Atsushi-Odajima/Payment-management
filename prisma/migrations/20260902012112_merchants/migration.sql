-- CreateTable
CREATE TABLE "Merchant" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_merchantCode_key" ON "Merchant"("merchantCode");

-- CreateIndex
CREATE INDEX "Merchant_createdAt_idx" ON "Merchant"("createdAt");
