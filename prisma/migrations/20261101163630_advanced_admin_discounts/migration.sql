-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "finalUnitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "originalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "product_discounts" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_discounts_productId_key" ON "product_discounts"("productId");

-- CreateIndex
CREATE INDEX "product_discounts_isActive_idx" ON "product_discounts"("isActive");

-- CreateIndex
CREATE INDEX "product_discounts_startDate_idx" ON "product_discounts"("startDate");

-- CreateIndex
CREATE INDEX "product_discounts_endDate_idx" ON "product_discounts"("endDate");

-- CreateIndex
CREATE INDEX "product_discounts_createdById_idx" ON "product_discounts"("createdById");

-- AddForeignKey
ALTER TABLE "product_discounts" ADD CONSTRAINT "product_discounts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_discounts" ADD CONSTRAINT "product_discounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill historical order item price snapshots from existing columns.
UPDATE "order_items"
SET
    "originalPrice" = "unitPrice",
    "finalUnitPrice" = "unitPrice",
    "discountAmount" = 0,
    "subtotal" = "totalPrice";
