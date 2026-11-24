-- Enable the admin-controlled fixed-price discount flag on products.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "isDiscountActive" BOOLEAN NOT NULL DEFAULT false;
