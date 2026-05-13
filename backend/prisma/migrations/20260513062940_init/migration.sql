-- CreateTable
CREATE TABLE "Stream" (
    "id" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "withdrawn" BIGINT NOT NULL,
    "startTs" BIGINT NOT NULL,
    "cliffTs" BIGINT NOT NULL,
    "endTs" BIGINT NOT NULL,
    "vestingType" INTEGER NOT NULL,
    "status" INTEGER NOT NULL,
    "cancelable" BOOLEAN NOT NULL,
    "milestoneCount" INTEGER NOT NULL,
    "nonce" BIGINT NOT NULL,
    "bump" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "streamId" TEXT,
    "type" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_signature_key" ON "Transaction"("signature");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;
