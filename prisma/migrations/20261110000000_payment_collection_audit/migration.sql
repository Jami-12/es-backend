-- Cash-on-delivery collection audit fields.
-- Safe additive migration: existing payments keep NULL collection metadata.

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "collectedById" UUID,
  ADD COLUMN IF NOT EXISTS "collectedByName" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "collectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "collectionNote" TEXT;
