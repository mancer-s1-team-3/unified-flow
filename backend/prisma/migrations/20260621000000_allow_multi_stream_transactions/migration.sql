UPDATE "Transaction"
SET "id" = "signature" || ':' || "streamId"
WHERE "streamId" IS NOT NULL AND "id" = "signature";

DROP INDEX "Transaction_signature_key";

CREATE INDEX "Transaction_signature_idx" ON "Transaction"("signature");
