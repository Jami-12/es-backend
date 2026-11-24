-- Dashboard-controlled shipping fee and automatic store-wide (flat) discount.
-- All columns are additive with safe defaults so existing installations keep
-- their previous behaviour until an admin changes them.
ALTER TABLE "site_settings"
  ADD COLUMN IF NOT EXISTS "shippingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "freeShippingThreshold" DECIMAL(12,2) NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS "flatDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "flatDiscountType" "DiscountType",
  ADD COLUMN IF NOT EXISTS "flatDiscountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "flatDiscountMinAmount" DECIMAL(12,2);
