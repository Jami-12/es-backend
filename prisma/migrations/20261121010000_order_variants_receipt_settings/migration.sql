-- Preserve the customer's selected size/colour on cart and ordered items,
-- link notifications to their order, and store printable receipt branding.

ALTER TABLE "cart_items"
  ADD COLUMN IF NOT EXISTS "selectedSize" VARCHAR(60) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "selectedColor" VARCHAR(60) NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "cart_items_cartId_productId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_cartId_productId_selectedSize_selectedColor_key"
  ON "cart_items"("cartId", "productId", "selectedSize", "selectedColor");

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "size" VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "color" VARCHAR(60);

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "orderId" UUID,
  ADD COLUMN IF NOT EXISTS "eventType" VARCHAR(40);
CREATE INDEX IF NOT EXISTS "notifications_orderId_idx" ON "notifications"("orderId");
CREATE INDEX IF NOT EXISTS "notifications_eventType_idx" ON "notifications"("eventType");
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_orderId_fkey";
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "receipt_settings" (
  "id" VARCHAR(40) NOT NULL DEFAULT 'default',
  "storeName" VARCHAR(160),
  "tagline" VARCHAR(240),
  "logoUrl" TEXT,
  "footerNote" TEXT,
  "contactPhone" VARCHAR(80),
  "contactEmail" VARCHAR(160),
  "contactAddress" TEXT,
  "showLogo" BOOLEAN NOT NULL DEFAULT true,
  "showSize" BOOLEAN NOT NULL DEFAULT true,
  "showColor" BOOLEAN NOT NULL DEFAULT true,
  "showPaymentMethod" BOOLEAN NOT NULL DEFAULT true,
  "showTransactionId" BOOLEAN NOT NULL DEFAULT true,
  "showCustomer" BOOLEAN NOT NULL DEFAULT true,
  "showShippingAddress" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "receipt_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "receipt_settings" ("id") VALUES ('default')
  ON CONFLICT ("id") DO NOTHING;
