import {
  Prisma,
  ProductStatus,
  Role,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import { deleteCloudinaryImage } from "../../config/cloudinary";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { toDecimal } from "../../utils/money";
import { buildPaginationMeta } from "../../utils/pagination";
import { resolveProductPricing } from "../../utils/productPricing";
import { slugify } from "../../utils/slug";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  CreateProductInput,
  PaginatedProducts,
  ProductImageInput,
  ProductListQuery,
  ProductResponse,
  UpdateProductInput,
} from "../../types/product.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const productInclude = {
  category: {
    select: { id: true, name: true, slug: true },
  },
  brand: {
    select: { id: true, name: true, slug: true, logo: true },
  },
  images: {
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      productId: true,
      imageUrl: true,
      publicId: true,
      altText: true,
      isPrimary: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  reviews: {
    where: { isApproved: true },
    select: { rating: true },
  },
  discount: true,
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

const resolveImageUrl = (image: ProductImageInput): string =>
  (image.imageUrl ?? image.url ?? "").trim();

const normalizeImages = (images: ProductImageInput[]) => {
  const hasPrimary = images.some((image) => image.isPrimary);
  const publicIds = images
    .map((image) => image.publicId?.trim())
    .filter((publicId): publicId is string => Boolean(publicId));

  if (new Set(publicIds).size !== publicIds.length) {
    throw ApiError.badRequest("Duplicate image publicId values are not allowed");
  }

  let primaryAssigned = false;

  return images.map((image, index) => {
    const imageUrl = resolveImageUrl(image);

    if (!imageUrl) {
      throw ApiError.badRequest("Image URL cannot be empty");
    }

    const isPrimary = hasPrimary
      ? Boolean(image.isPrimary) && !primaryAssigned
      : index === 0;

    if (isPrimary) {
      primaryAssigned = true;
    }

    return {
      imageUrl,
      publicId: image.publicId?.trim() || null,
      altText: image.altText?.trim() || null,
      isPrimary,
      sortOrder: image.sortOrder ?? index,
    };
  });
};

const canManageCatalog = (requester?: AuthenticatedUser): boolean =>
  requester?.role === Role.ADMIN || requester?.role === Role.SUPER_ADMIN;

const toProductResponse = (
  product: ProductRecord,
  includeCosts = false,
): ProductResponse => {
  const reviewCount = product.reviews.length;
  const ratingTotal = product.reviews.reduce(
    (sum, review) => sum + review.rating,
    0,
  );
  const averageRating =
    reviewCount > 0 ? Math.round((ratingTotal / reviewCount) * 10) / 10 : 0;
  const pricing = resolveProductPricing(product.price, product.discount);
  const thumbnail =
    product.images.find((image) => image.isPrimary)?.imageUrl ??
    product.images[0]?.imageUrl ??
    null;

  return {
    id: product.id,
    title: product.title,
    name: product.title,
    slug: product.slug,
    sku: product.sku,
    description: product.description,
    shortDescription: product.shortDescription,
    price: product.price.toNumber(),
    originalPrice: pricing.originalPrice.toNumber(),
    discountPrice: product.discountPrice?.toNumber() ?? null,
    discount: pricing.discount,
    sellingPrice: pricing.finalPrice.toNumber(),
    finalPrice: pricing.finalPrice.toNumber(),
    purchasePrice: includeCosts ? product.purchasePrice.toNumber() : null,
    stock: product.stock,
    minimumStockLevel: product.minimumStockLevel,
    soldCount: product.soldCount,
    status: product.status,
    isFeatured: product.isFeatured,
    isArchived: product.archivedAt !== null,
    archivedAt: product.archivedAt?.toISOString() ?? null,
    category: product.category,
    brand: product.brand,
    images: product.images.map((image) => ({
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
    })),
    thumbnail,
    modelUrl: product.modelUrl,
    positionX: product.positionX,
    positionY: product.positionY,
    positionZ: product.positionZ,
    wallPositionX: product.positionX,
    wallPositionY: product.positionY,
    wallPositionZ: product.positionZ,
    rotationX: product.rotationX,
    rotationY: product.rotationY,
    rotationZ: product.rotationZ,
    scale: product.scale,
    averageRating,
    reviewCount,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
};

const ensureCategoryExists = async (categoryId: string): Promise<void> => {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });

  if (!category) {
    throw ApiError.badRequest("The selected category does not exist");
  }
};

const ensureBrandExists = async (brandId: string): Promise<void> => {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true },
  });

  if (!brand) {
    throw ApiError.badRequest("The selected brand does not exist");
  }
};

const resolveBrandId = async (
  brandId?: string | null,
  brandName?: string | null,
): Promise<string | null | undefined> => {
  if (brandId !== undefined) {
    if (brandId === null) {
      return null;
    }

    await ensureBrandExists(brandId);
    return brandId;
  }

  if (brandName !== undefined) {
    const name = brandName?.trim();

    if (!name) {
      return null;
    }

    const brand = await prisma.brand.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });

    if (!brand) {
      throw ApiError.badRequest(
        `Brand "${name}" does not exist. Create the brand first or provide brandId.`,
      );
    }

    return brand.id;
  }

  return undefined;
};

const buildProductImages = (
  images: ProductImageInput[] | undefined,
  thumbnail?: string | null,
  existingPublicIdsByUrl?: Map<string, string>,
): ReturnType<typeof normalizeImages> => {
  const list = [...(images ?? [])];
  const thumbnailUrl = thumbnail?.trim();

  if (thumbnailUrl) {
    const existingIndex = list.findIndex(
      (image) => resolveImageUrl(image) === thumbnailUrl,
    );

    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], isPrimary: true };
    } else {
      list.unshift({
        url: thumbnailUrl,
        imageUrl: thumbnailUrl,
        altText: "Product thumbnail",
        isPrimary: true,
      });
    }
  }

  if (list.length === 0) {
    throw ApiError.badRequest("At least one product image is required");
  }

  const normalized = normalizeImages(list);

  if (!existingPublicIdsByUrl) {
    return normalized;
  }

  return normalized.map((image) => {
    if (image.publicId) {
      return image;
    }

    return {
      ...image,
      publicId: existingPublicIdsByUrl.get(image.imageUrl) ?? null,
    };
  });
};

export const createProduct = async (
  actorId: string,
  input: CreateProductInput,
  ipAddress?: string,
): Promise<ProductResponse> => {
  const slug = slugify(input.slug ?? input.title);

  if (!slug) {
    throw ApiError.badRequest("Product slug is invalid");
  }

  const sku = input.sku.trim();

  if (
    input.discountPrice !== undefined &&
    input.discountPrice !== null &&
    input.discountPrice >= input.price
  ) {
    throw ApiError.badRequest("Discount price must be lower than the regular price");
  }

  const duplicate = await prisma.product.findFirst({
    where: { OR: [{ slug }, { sku }] },
    select: { id: true, slug: true, sku: true },
  });

  if (duplicate) {
    throw ApiError.conflict(
      duplicate.sku === sku
        ? "A product with this SKU already exists"
        : "A product with this slug already exists",
    );
  }

  await ensureCategoryExists(input.categoryId);

  const brandId = await resolveBrandId(input.brandId, input.brandName);
  const images = buildProductImages(input.images, input.thumbnail);

  const product = await prisma.product.create({
    data: {
      title: input.title.trim(),
      slug,
      sku,
      description: input.description.trim(),
      shortDescription: input.shortDescription?.trim() || null,
      price: toDecimal(input.price),
      discountPrice:
        input.discountPrice !== undefined
          ? toDecimal(input.discountPrice)
          : null,
      costPrice:
        input.costPrice !== undefined ? toDecimal(input.costPrice) : null,
      purchasePrice: toDecimal(
        input.purchasePrice ?? input.costPrice ?? 0,
      ),
      stock: input.stock,
      minimumStockLevel: input.minimumStockLevel ?? 5,
      status: input.status ?? ProductStatus.ACTIVE,
      isFeatured: input.isFeatured ?? false,
      category: { connect: { id: input.categoryId } },
      brand: brandId ? { connect: { id: brandId } } : undefined,
      modelUrl: input.modelUrl?.trim() || null,
      positionX: input.positionX ?? 0,
      positionY: input.positionY ?? 0,
      positionZ: input.positionZ ?? 0,
      rotationX: input.rotationX ?? 0,
      rotationY: input.rotationY ?? 0,
      rotationZ: input.rotationZ ?? 0,
      scale: input.scale ?? 1,
      images: {
        create: images,
      },
    },
    include: productInclude,
  });

  await recordAudit({
    userId: actorId,
    action: "CREATE_PRODUCT",
    entity: "Product",
    entityId: product.id,
    description: `Created product ${product.title}`,
    newData: product,
    ipAddress,
  });

  return toProductResponse(product, true);
};

export const listProducts = async (
  query: ProductListQuery,
  requester?: AuthenticatedUser,
): Promise<PaginatedProducts> => {
  const where: Prisma.ProductWhereInput = {};
  const canViewAllStatuses = canManageCatalog(requester);

  if (!canViewAllStatuses) {
    where.archivedAt = null;
  }

  if (query.status !== undefined) {
    if (!canViewAllStatuses && query.status !== ProductStatus.ACTIVE) {
      throw ApiError.forbidden("Only administrators can filter by product status");
    }

    where.status = query.status;
  } else if (!canViewAllStatuses) {
    where.status = ProductStatus.ACTIVE;
  }

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { shortDescription: { contains: query.search, mode: "insensitive" } },
      { sku: { contains: query.search, mode: "insensitive" } },
    ];
  }

  if (query.category) {
    if (UUID_PATTERN.test(query.category)) {
      where.categoryId = query.category;
    } else {
      where.category = { is: { slug: query.category } };
    }
  }

  if (query.brand) {
    if (UUID_PATTERN.test(query.brand)) {
      where.brandId = query.brand;
    } else {
      where.brand = { is: { slug: query.brand } };
    }
  }

  if (typeof query.featured === "boolean") {
    where.isFeatured = query.featured;
  }

  if (typeof query.inStock === "boolean") {
    where.stock = query.inStock ? { gt: 0 } : { equals: 0 };
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {
      ...(query.minPrice !== undefined && {
        gte: toDecimal(query.minPrice),
      }),
      ...(query.maxPrice !== undefined && {
        lte: toDecimal(query.maxPrice),
      }),
    };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const skip = (query.page - 1) * query.limit;

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy,
      skip,
      take: query.limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: products.map((product) => toProductResponse(product, canViewAllStatuses)),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getProductById = async (
  id: string,
  requester?: AuthenticatedUser,
): Promise<ProductResponse> => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productInclude,
  });

  if (
    !product ||
    (!canManageCatalog(requester) &&
      (product.status !== ProductStatus.ACTIVE ||
        product.archivedAt !== null))
  ) {
    throw ApiError.notFound("Product not found");
  }

  return toProductResponse(product, canManageCatalog(requester));
};

export const getProductBySlug = async (
  slug: string,
  requester?: AuthenticatedUser,
): Promise<ProductResponse> => {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: productInclude,
  });

  if (
    !product ||
    (!canManageCatalog(requester) &&
      (product.status !== ProductStatus.ACTIVE ||
        product.archivedAt !== null))
  ) {
    throw ApiError.notFound("Product not found");
  }

  return toProductResponse(product, canManageCatalog(requester));
};

export const updateProduct = async (
  actorId: string,
  productId: string,
  input: UpdateProductInput,
  ipAddress?: string,
): Promise<ProductResponse> => {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    include: { images: true },
  });

  if (!existing) {
    throw ApiError.notFound("Product not found");
  }

  if (input.categoryId) {
    await ensureCategoryExists(input.categoryId);
  }

  const brandId = await resolveBrandId(input.brandId, input.brandName);

  const data: Prisma.ProductUpdateInput = {};

  if (input.title !== undefined) {
    data.title = input.title.trim();
  }

  if (input.slug !== undefined) {
    const slug = slugify(input.slug);

    if (!slug) {
      throw ApiError.badRequest("Product slug is invalid");
    }

    data.slug = slug;
  }

  if (input.sku !== undefined) {
    data.sku = input.sku.trim();
  }

  if (input.description !== undefined) {
    data.description = input.description.trim();
  }

  if (input.shortDescription !== undefined) {
    data.shortDescription = input.shortDescription?.trim() || null;
  }

  if (input.price !== undefined) {
    data.price = toDecimal(input.price);
  }

  if (input.discountPrice !== undefined) {
    data.discountPrice =
      input.discountPrice !== null ? toDecimal(input.discountPrice) : null;
  }

  if (input.costPrice !== undefined) {
    data.costPrice =
      input.costPrice !== null ? toDecimal(input.costPrice) : null;
  }

  if (input.purchasePrice !== undefined) {
    data.purchasePrice = toDecimal(input.purchasePrice ?? 0);
  }

  if (input.stock !== undefined) {
    data.stock = input.stock;
  }

  if (input.minimumStockLevel !== undefined) {
    data.minimumStockLevel = input.minimumStockLevel;
  }

  if (input.status !== undefined) {
    data.status = input.status;

    if (input.status === ProductStatus.ACTIVE && existing.archivedAt !== null) {
      data.archivedAt = null;
    }
  }

  if (input.isFeatured !== undefined) {
    data.isFeatured = input.isFeatured;
  }

  if (input.categoryId !== undefined) {
    data.category = { connect: { id: input.categoryId } };
  }

  if (brandId !== undefined) {
    data.brand =
      brandId !== null
        ? { connect: { id: brandId } }
        : { disconnect: true };
  }

  if (input.modelUrl !== undefined) {
    data.modelUrl = input.modelUrl?.trim() || null;
  }

  if (input.positionX !== undefined) data.positionX = input.positionX;
  if (input.positionY !== undefined) data.positionY = input.positionY;
  if (input.positionZ !== undefined) data.positionZ = input.positionZ;
  if (input.rotationX !== undefined) data.rotationX = input.rotationX;
  if (input.rotationY !== undefined) data.rotationY = input.rotationY;
  if (input.rotationZ !== undefined) data.rotationZ = input.rotationZ;
  if (input.scale !== undefined) data.scale = input.scale;

  const existingPublicIdsByUrl = new Map<string, string>(
    existing.images
      .filter((image) => Boolean(image.publicId))
      .map((image) => [image.imageUrl, image.publicId as string]),
  );

  if (input.images !== undefined) {
    data.images = {
      deleteMany: {},
      create: buildProductImages(
        input.images,
        input.thumbnail,
        existingPublicIdsByUrl,
      ),
    };
  } else if (input.thumbnail !== undefined) {
    const currentImages: ProductImageInput[] = existing.images.map((image) => ({
      url: image.imageUrl,
      imageUrl: image.imageUrl,
      publicId: image.publicId ?? undefined,
      altText: image.altText ?? undefined,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder,
    }));

    if (input.thumbnail === null) {
      data.images = {
        deleteMany: {},
        create: currentImages.map((image, index) => ({
          imageUrl: resolveImageUrl(image),
          publicId: image.publicId?.trim() || null,
          altText: image.altText?.trim() || null,
          isPrimary: false,
          sortOrder: index,
        })),
      };
    } else {
      data.images = {
        deleteMany: {},
        create: buildProductImages(
          currentImages,
          input.thumbnail,
          existingPublicIdsByUrl,
        ),
      };
    }
  }

  if (data.slug !== undefined || data.sku !== undefined) {
    const duplicate = await prisma.product.findFirst({
      where: {
        id: { not: productId },
        OR: [
          ...(typeof data.slug === "string" ? [{ slug: data.slug }] : []),
          ...(typeof data.sku === "string" ? [{ sku: data.sku }] : []),
        ],
      },
      select: { id: true },
    });

    if (duplicate) {
      throw ApiError.conflict("A product with this slug or SKU already exists");
    }
  }

  const finalPrice =
    input.price !== undefined ? input.price : existing.price.toNumber();
  const finalDiscount =
    input.discountPrice !== undefined
      ? input.discountPrice
      : existing.discountPrice?.toNumber() ?? null;

  if (
    finalDiscount !== null &&
    finalDiscount !== undefined &&
    finalDiscount >= finalPrice
  ) {
    throw ApiError.badRequest("Discount price must be lower than the regular price");
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data,
    include: productInclude,
  });

  if (input.images !== undefined || input.thumbnail !== undefined) {
    const retainedPublicIds = new Set(
      product.images
        .map((image) => image.publicId)
        .filter((publicId): publicId is string => Boolean(publicId)),
    );
    const removedPublicIds = existing.images
      .map((image) => image.publicId)
      .filter(
        (publicId): publicId is string =>
          typeof publicId === "string" && !retainedPublicIds.has(publicId),
      );

    await Promise.allSettled(
      removedPublicIds.map(async (publicId) => {
        try {
          await deleteCloudinaryImage(publicId);
        } catch (error) {
          console.error(
            `Failed to delete replaced Cloudinary image ${publicId}:`,
            error,
          );
        }
      }),
    );
  }

  await recordAudit({
    userId: actorId,
    action: "UPDATE_PRODUCT",
    entity: "Product",
    entityId: product.id,
    description: `Updated product ${product.title}`,
    oldData: existing,
    newData: product,
    ipAddress,
  });

  return toProductResponse(product, true);
};

export const deleteProduct = async (
  actorId: string,
  productId: string,
  ipAddress?: string,
): Promise<void> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { images: true },
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  const archivedAt = new Date();

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: {
        status: ProductStatus.INACTIVE,
        archivedAt,
        isFeatured: false,
      },
    }),
    prisma.productDiscount.updateMany({
      where: { productId },
      data: { isActive: false },
    }),
  ]);

  await recordAudit({
    userId: actorId,
    action: "ARCHIVE_PRODUCT",
    entity: "Product",
    entityId: productId,
    description: `Archived product ${product.title}`,
    oldData: product,
    newData: {
      id: productId,
      title: product.title,
      status: ProductStatus.INACTIVE,
      archivedAt: archivedAt.toISOString(),
    },
    ipAddress,
  });
};
