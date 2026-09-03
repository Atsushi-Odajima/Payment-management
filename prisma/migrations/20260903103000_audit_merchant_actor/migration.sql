-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorType" TEXT NOT NULL DEFAULT 'admin',
    "actorId" TEXT,
    "merchantId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "before" TEXT,
    "after" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "actorId", "actorType", "after", "before", "createdAt", "id", "ip", "targetId", "targetType") SELECT "action", "actorId", "actorType", "after", "before", "createdAt", "id", "ip", "targetId", "targetType" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

