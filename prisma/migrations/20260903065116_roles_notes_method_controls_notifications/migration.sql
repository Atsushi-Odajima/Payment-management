-- CreateTable
CREATE TABLE "TransactionNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" DATETIME,
    CONSTRAINT "TransactionNote_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransactionNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AdminUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentMethodControl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "merchantId" TEXT,
    "method" TEXT NOT NULL,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "suspendedById" TEXT,
    "suspendedAt" DATETIME,
    "resumeAt" DATETIME,
    "resumedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentMethodControl_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "roles" TEXT NOT NULL DEFAULT '[]',
    "targetType" TEXT,
    "targetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GlobalSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "viewerCsvExport" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TransactionNote_paymentId_idx" ON "TransactionNote"("paymentId");

-- CreateIndex
CREATE INDEX "TransactionNote_authorId_idx" ON "TransactionNote"("authorId");

-- CreateIndex
CREATE INDEX "PaymentMethodControl_suspended_idx" ON "PaymentMethodControl"("suspended");

-- CreateIndex
CREATE INDEX "PaymentMethodControl_resumeAt_idx" ON "PaymentMethodControl"("resumeAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodControl_scope_merchantId_method_key" ON "PaymentMethodControl"("scope", "merchantId", "method");

-- CreateIndex
CREATE INDEX "Notification_kind_idx" ON "Notification"("kind");

-- CreateIndex
CREATE INDEX "Notification_severity_idx" ON "Notification"("severity");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_targetType_targetId_idx" ON "Notification"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "NotificationRead_adminUserId_idx" ON "NotificationRead"("adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRead_notificationId_adminUserId_key" ON "NotificationRead"("notificationId", "adminUserId");
