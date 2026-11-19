-- Storefront presentation settings: navbar logo and home section visibility.
-- The settings table is a singleton identified by the fixed "default" id.

CREATE TABLE IF NOT EXISTS "site_settings" (
  "id" VARCHAR(40) NOT NULL,
  "siteName" VARCHAR(120),
  "navbarLogoUrl" TEXT,
  "navbarLogoPublicId" VARCHAR(255),
  "showHero" BOOLEAN NOT NULL DEFAULT true,
  "showProductFinder" BOOLEAN NOT NULL DEFAULT true,
  "showMiddleCategories" BOOLEAN NOT NULL DEFAULT true,
  "showCategorySections" BOOLEAN NOT NULL DEFAULT true,
  "showNewArrivals" BOOLEAN NOT NULL DEFAULT true,
  "showBrands" BOOLEAN NOT NULL DEFAULT true,
  "showPromoBanners" BOOLEAN NOT NULL DEFAULT true,
  "showNewsletter" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "site_settings" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "home_category_sections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "settingsId" VARCHAR(40) NOT NULL,
  "categoryId" UUID NOT NULL,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "home_category_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "home_category_sections_settingsId_categoryId_key"
  ON "home_category_sections"("settingsId", "categoryId");
CREATE INDEX IF NOT EXISTS "home_category_sections_settingsId_sortOrder_idx"
  ON "home_category_sections"("settingsId", "sortOrder");

ALTER TABLE "home_category_sections" DROP CONSTRAINT IF EXISTS "home_category_sections_settingsId_fkey";
ALTER TABLE "home_category_sections"
  ADD CONSTRAINT "home_category_sections_settingsId_fkey"
  FOREIGN KEY ("settingsId") REFERENCES "site_settings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "home_category_sections" DROP CONSTRAINT IF EXISTS "home_category_sections_categoryId_fkey";
ALTER TABLE "home_category_sections"
  ADD CONSTRAINT "home_category_sections_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
