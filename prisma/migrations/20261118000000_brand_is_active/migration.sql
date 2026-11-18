-- Add an enable/disable flag to brands so storefront visibility can be
-- controlled independently without deleting product relations.
ALTER TABLE "brands"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "brands_isActive_idx" ON "brands"("isActive");
