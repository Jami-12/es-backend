-- Align the database default with the Prisma schema.
-- Prisma manages product_images.updatedAt through @updatedAt.
ALTER TABLE "product_images" ALTER COLUMN "updatedAt" DROP DEFAULT;
