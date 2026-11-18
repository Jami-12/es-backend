-- Fix Payment collection relations and add the storefront banner table.
-- Additive and safe for existing rows.

-- Make collectedById a real user reference. Orphaned ids (for example from a
-- deleted admin) are cleared before the constraint is created.
UPDATE "payments" AS p
SET "collectedById" = NULL
WHERE p."collectedById" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = p."collectedById");

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_collectedById_fkey";
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_collectedById_fkey"
  FOREIGN KEY ("collectedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "payments_collectedById_idx"
  ON "payments"("collectedById");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BannerPlacement') THEN
    CREATE TYPE "BannerPlacement" AS ENUM ('HERO', 'PROMO');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "banners" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(160) NOT NULL,
  "subtitle" VARCHAR(300),
  "imageUrl" TEXT NOT NULL,
  "publicId" VARCHAR(255),
  "linkUrl" TEXT,
  "placement" "BannerPlacement" NOT NULL DEFAULT 'PROMO',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "banners_publicId_key" ON "banners"("publicId");
CREATE INDEX IF NOT EXISTS "banners_placement_isActive_sortOrder_idx"
  ON "banners"("placement", "isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "banners_isActive_idx" ON "banners"("isActive");
