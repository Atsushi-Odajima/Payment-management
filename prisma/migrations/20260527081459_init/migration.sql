-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "credentials" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "lastTestAt" DATETIME,
    "lastTestOk" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "capturedAt" DATETIME,
    "cancelledAt" DATETIME,
    "refundedAt" DATETIME,
    CONSTRAINT "Payment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PaymentProvider_category_idx" ON "PaymentProvider"("category");

-- CreateIndex
CREATE INDEX "PaymentProvider_providerKey_idx" ON "PaymentProvider"("providerKey");

-- CreateIndex
CREATE INDEX "Payment_providerId_idx" ON "Payment"("providerId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
