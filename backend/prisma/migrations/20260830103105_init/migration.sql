-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "reconciliationId" TEXT,
    CONSTRAINT "Transaction_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "ReconciliationResult" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReconciliationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "reasoning" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
