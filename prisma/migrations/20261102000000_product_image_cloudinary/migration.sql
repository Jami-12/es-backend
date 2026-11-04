-- Rename the legacy image URL column to the explicit imageUrl field.
ALTER TABLE "product_images" RENAME COLUMN "url" TO "imageUrl";

-- Store the Cloudinary public id so remote assets can be managed/deleted safely.
ALTER TABLE "product_images" ADD COLUMN "publicId" VARCHAR(255);

-- Add the missing audit timestamp. Existing rows inherit the migration time.
ALTER TABLE "product_images" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Normalise existing data so each product has at most one primary image.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "productId"
            ORDER BY "isPrimary" DESC, "sortOrder" ASC, "createdAt" ASC, "id" ASC
        ) AS row_number
    FROM "product_images"
)
UPDATE "product_images" AS image
SET "isPrimary" = (ranked.row_number = 1)
FROM ranked
WHERE image."id" = ranked."id";

CREATE UNIQUE INDEX "product_images_publicId_key" ON "product_images"("publicId");
CREATE INDEX "product_images_productId_isPrimary_idx" ON "product_images"("productId", "isPrimary");
CREATE INDEX "product_images_productId_sortOrder_idx" ON "product_images"("productId", "sortOrder");

-- Database-level guarantee that a product cannot have more than one primary image.
CREATE UNIQUE INDEX "product_images_productId_primary_key"
ON "product_images"("productId")
WHERE "isPrimary" = true;
