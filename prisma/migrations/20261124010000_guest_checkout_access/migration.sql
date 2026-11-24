-- Guest checkout can be retrieved and paid for without a customer login by
-- presenting the random token issued with the public checkout response.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "guestToken" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "guestEmail" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "guestPhone" VARCHAR(30);

CREATE UNIQUE INDEX IF NOT EXISTS "orders_guestToken_key" ON "orders"("guestToken");
