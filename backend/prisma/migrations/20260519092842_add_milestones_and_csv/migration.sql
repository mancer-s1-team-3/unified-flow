-- AlterTable
ALTER TABLE "Stream" ADD COLUMN "isCsvCreated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Stream" ADD COLUMN "milestones" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Stream" ADD COLUMN "unlockedAmount" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CsvUpload" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "uploader" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsvUpload_pkey" PRIMARY KEY ("id")
);
