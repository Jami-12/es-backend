import { Prisma, ProductStatus, Role } from "@prisma/client";
import {
  CLOUDINARY_PRODUCT_FOLDER,
  deleteCloudinaryImage,
  ensureCloudinaryConfigured,
  uploadImageBuffer,
} from "../../config/cloudinary";
import { prisma } from "../../config/prisma";
import {
  MAX_PRODUCT_IMAGES_PER_PRODUCT,
} from "../../middlewares/upload.middleware";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  ProductImageResponse,
  ProductImageUpdateInput,
  ProductImageUploadInput,
  ReorderProductImagesInput,
} from "../../types/product.types";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";

const imageSelect = {
  id: true,
  productId: true,
  imageUrl: true,
  publicId: true,
  altText: true,
  isPrimary: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductImageSelect;

type ProductImageRecord = Prisma.ProductImageGetPayload<{
  select: typeof imageSelect;
}>;

const imageOrderBy: Prisma.ProductImageOrderByWithRelationInput[] = [
  { isPrimary: "desc" },
  { sortOrder: "asc" },
  { createdAt: "asc" },
];

const toImageResponse = (image: ProductImageRecord): ProductImageResponse => ({
  id: image.id,
  productId: image.productId,
  imageUrl: image.imageUrl,
  url: image.imageUrl,
  publicId: image.publicId,
  altText: image.altText,
  isPrimary: image.isPrimary,
  sortOrder: image.sortOrder,
  createdAt: image.createdAt.toISOString(),
  updatedAt: image.updatedAt.toISOString(),
});

const canManageCatalog = (requester?: AuthenticatedUser): boolean =>
  requester?.role === Role.ADMIN || requester?.role === Role.SUPER_ADMIN;

const lockProduct = async (
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "products" WHERE "id" = ${productId}::uuid FOR UPDATE
  `;

  if (rows.length === 0) {
    throw ApiError.notFound("Product not found");
  }
};

const cleanupUploadedImages = async (publicIds: string[]): Promise<void> => {
  await Promise.allSettled(
    publicIds.map(async (publicId) => {
      try {
        await deleteCloudinaryImage(publicId);
      } catch (error) {
        console.error(
          `Failed to roll back Cloudinary image ${publicId}:`,
          error,
        );
      }
    }),
  );
};

export const listProductImages = async (
  productId: string,
  requester?: AuthenticatedUser,
): Promise<ProductImageResponse[]> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      status: true,
      archivedAt: true,
      images: {
        orderBy: imageOrderBy,
        select: imageSelect,
      },
    },
  });

  if (
    !product ||
    (!canManageCatalog(requester) &&
      (product.status !== ProductStatus.ACTIVE ||
        product.archivedAt !== null))
  ) {
    throw ApiError.notFound("Product not found");
  }

  return product.images.map(toImageResponse);
};

export const uploadProductImages = async (
  actorId: string,
  productId: string,
  files: Express.Multer.File[],
  input: ProductImageUploadInput,
  ipAddress?: string,
): Promise<ProductImageResponse[]> => {
  ensureCloudinaryConfigured();

  if (files.length === 0) {
    throw ApiError.badRequest(
      "At least one image file is required. Use the \"images\" or \"image\" multipart field.",
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      archivedAt: true,
      images: {
        select: { id: true, isPrimary: true, sortOrder: true },
      },
    },
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  if (product.archivedAt !== null) {
    throw ApiError.badRequest("Cannot upload images to an archived product");
  }

  if (product.images.length + files.length > MAX_PRODUCT_IMAGES_PER_PRODUCT) {
    throw ApiError.badRequest(
      `A product can have at most ${MAX_PRODUCT_IMAGES_PER_PRODUCT} images`,
    );
  }

  const folder = `${CLOUDINARY_PRODUCT_FOLDER}/${productId}`;
  const uploaded: { imageUrl: string; publicId: string }[] = [];

  try {
    for (const file of files) {
      const result = await uploadImageBuffer(file.buffer, folder);
      uploaded.push(result);
    }
  } catch (error) {
    await cleanupUploadedImages(uploaded.map((image) => image.publicId));

    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.internal("Failed to upload product images");
  }

  let images: ProductImageRecord[];

  try {
    images = await prisma.$transaction(async (tx) => {
      await lockProduct(tx, productId);

      const currentImages = await tx.productImage.findMany({
        where: { productId },
        select: { id: true, isPrimary: true, sortOrder: true },
      });

      if (
        currentImages.length + uploaded.length >
        MAX_PRODUCT_IMAGES_PER_PRODUCT
      ) {
        throw ApiError.badRequest(
          `A product can have at most ${MAX_PRODUCT_IMAGES_PER_PRODUCT} images`,
        );
      }

      const hasPrimary = currentImages.some((image) => image.isPrimary);
      const shouldBePrimary = Boolean(input.isPrimary) || !hasPrimary;

      if (shouldBePrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const maxSortOrder = currentImages.reduce(
        (max, image) => Math.max(max, image.sortOrder),
        -1,
      );

      await tx.productImage.createMany({
        data: uploaded.map((image, index) => ({
          productId,
          imageUrl: image.imageUrl,
          publicId: image.publicId,
          altText:
            input.altTexts?.[index]?.trim() ||
            (index === 0 ? input.altText?.trim() : null) ||
            null,
          isPrimary: shouldBePrimary && index === 0,
          sortOrder: maxSortOrder + 1 + index,
        })),
      });

      return tx.productImage.findMany({
        where: { productId },
        orderBy: imageOrderBy,
        select: imageSelect,
      });
    });
  } catch (error) {
    await cleanupUploadedImages(uploaded.map((image) => image.publicId));
    throw error;
  }

  await recordAudit({
    userId: actorId,
    action: "UPLOAD_PRODUCT_IMAGES",
    entity: "Product",
    entityId: productId,
    description: `Uploaded ${uploaded.length} image(s) to product ${product.title}`,
    newData: images,
    ipAddress,
  });

  return images.map(toImageResponse);
};

export const updateProductImage = async (
  actorId: string,
  productId: string,
  imageId: string,
  input: ProductImageUpdateInput,
  ipAddress?: string,
): Promise<{ image: ProductImageResponse; images: ProductImageResponse[] }> => {
  const existing = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: imageSelect,
  });

  if (!existing) {
    throw ApiError.notFound("Product image not found");
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockProduct(tx, productId);

    const siblings = await tx.productImage.findMany({
      where: { productId },
      orderBy: imageOrderBy,
      select: imageSelect,
    });
    const current = siblings.find((image) => image.id === imageId);

    if (!current) {
      throw ApiError.notFound("Product image not found");
    }

    const data: Prisma.ProductImageUpdateInput = {};

    if (input.altText !== undefined) {
      data.altText = input.altText?.trim() || null;
    }

    if (input.sortOrder !== undefined) {
      data.sortOrder = input.sortOrder;
    }

    if (input.isPrimary === true) {
      await tx.productImage.updateMany({
        where: { productId, isPrimary: true, id: { not: imageId } },
        data: { isPrimary: false },
      });
      data.isPrimary = true;
    }

    if (input.isPrimary === false && current.isPrimary) {
      const replacement = siblings.find((image) => image.id !== imageId);

      if (!replacement) {
        throw ApiError.badRequest(
          "Cannot remove primary status from the only image; upload another image or delete this image",
        );
      }

      await tx.productImage.update({
        where: { id: imageId },
        data: { ...data, isPrimary: false },
      });
      await tx.productImage.update({
        where: { id: replacement.id },
        data: { isPrimary: true },
      });
    } else {
      if (input.isPrimary === false) {
        data.isPrimary = false;
      }

      await tx.productImage.update({
        where: { id: imageId },
        data,
      });
    }

    const images = await tx.productImage.findMany({
      where: { productId },
      orderBy: imageOrderBy,
      select: imageSelect,
    });
    const updated = images.find((image) => image.id === imageId);

    if (!updated) {
      throw ApiError.notFound("Product image not found");
    }

    return { image: updated, images };
  });

  await recordAudit({
    userId: actorId,
    action: "UPDATE_PRODUCT_IMAGE",
    entity: "Product",
    entityId: productId,
    description: `Updated image ${imageId} of product ${productId}`,
    oldData: existing,
    newData: result.image,
    ipAddress,
  });

  return {
    image: toImageResponse(result.image),
    images: result.images.map(toImageResponse),
  };
};

export const setPrimaryProductImage = async (
  actorId: string,
  productId: string,
  imageId: string,
  ipAddress?: string,
): Promise<{ image: ProductImageResponse; images: ProductImageResponse[] }> =>
  updateProductImage(
    actorId,
    productId,
    imageId,
    { isPrimary: true },
    ipAddress,
  );

export const reorderProductImages = async (
  actorId: string,
  productId: string,
  input: ReorderProductImagesInput,
  ipAddress?: string,
): Promise<ProductImageResponse[]> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, images: { select: { id: true } } },
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  const currentIds = product.images.map((image) => image.id);
  const requestedIds = new Set(input.imageIds);

  if (
    requestedIds.size !== input.imageIds.length ||
    input.imageIds.length !== currentIds.length ||
    currentIds.some((id) => !requestedIds.has(id))
  ) {
    throw ApiError.badRequest(
      "imageIds must contain every product image exactly once",
    );
  }

  const images = await prisma.$transaction(async (tx) => {
    await lockProduct(tx, productId);

    for (const [index, imageId] of input.imageIds.entries()) {
      await tx.productImage.update({
        where: { id: imageId },
        data: { sortOrder: index },
      });
    }

    return tx.productImage.findMany({
      where: { productId },
      orderBy: imageOrderBy,
      select: imageSelect,
    });
  });

  await recordAudit({
    userId: actorId,
    action: "REORDER_PRODUCT_IMAGES",
    entity: "Product",
    entityId: productId,
    description: `Reordered ${input.imageIds.length} image(s) of product ${productId}`,
    newData: images,
    ipAddress,
  });

  return images.map(toImageResponse);
};

export const deleteProductImage = async (
  actorId: string,
  productId: string,
  imageId: string,
  ipAddress?: string,
): Promise<{ removed: ProductImageResponse; images: ProductImageResponse[] }> => {
  const existing = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: imageSelect,
  });

  if (!existing) {
    throw ApiError.notFound("Product image not found");
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockProduct(tx, productId);

    const siblings = await tx.productImage.findMany({
      where: { productId },
      orderBy: imageOrderBy,
      select: imageSelect,
    });
    const target = siblings.find((image) => image.id === imageId);

    if (!target) {
      throw ApiError.notFound("Product image not found");
    }

    await tx.productImage.delete({ where: { id: imageId } });

    if (target.isPrimary) {
      const replacement = siblings.find((image) => image.id !== imageId);

      if (replacement) {
        await tx.productImage.update({
          where: { id: replacement.id },
          data: { isPrimary: true },
        });
      }
    }

    const images = await tx.productImage.findMany({
      where: { productId },
      orderBy: imageOrderBy,
      select: imageSelect,
    });

    return { removed: target, images };
  });

  if (existing.publicId) {
    try {
      await deleteCloudinaryImage(existing.publicId);
    } catch (error) {
      console.error(
        `Failed to delete Cloudinary image ${existing.publicId}:`,
        error,
      );
    }
  }

  await recordAudit({
    userId: actorId,
    action: "DELETE_PRODUCT_IMAGE",
    entity: "Product",
    entityId: productId,
    description: `Deleted image ${imageId} from product ${productId}`,
    oldData: existing,
    newData: result.images,
    ipAddress,
  });

  return {
    removed: toImageResponse(result.removed),
    images: result.images.map(toImageResponse),
  };
};
