-- Dashboard-controlled payment method availability.
-- Defaults are ON so existing installations keep their current behaviour.
ALTER TABLE "site_settings"
  ADD COLUMN IF NOT EXISTS "codEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "bkashEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "nagadEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "stripeEnabled" BOOLEAN NOT NULL DEFAULT true;
