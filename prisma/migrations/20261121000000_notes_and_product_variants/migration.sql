-- Dashboard notepad (per staff user) and product variant options.
-- Both additions are backward compatible: existing products simply have no
-- configured variants, which the API and storefront treat as an empty list.

CREATE TABLE IF NOT EXISTS "notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "title" VARCHAR(120),
  "content" TEXT NOT NULL,
  "color" VARCHAR(20) NOT NULL DEFAULT '#facc15',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notes_userId_updatedAt_idx"
  ON "notes"("userId", "updatedAt");

ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_userId_fkey";
ALTER TABLE "notes"
  ADD CONSTRAINT "notes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sizes" JSONB;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "colors" JSONB;
