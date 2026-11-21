import {
  Prisma,
  ProductStatus,
  Role,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  deleteCloudinaryImage,
  isCloudinaryConfigured,
} from "../../config/cloudinary";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { toDecimal } from "../../utils/money";
import { buildPaginationMeta } from "../../utils/pagination";
import { resolveProductPricing } from "../../utils/productPricing";
import {
  generateUniqueSlug,
  generateUniqueSku,
  slugify,
} from "../../utils/slug";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  CreateProductInput,
  PaginatedProducts,
  ProductColorOption,
  ProductImageInput,
  ProductListQuery,
  ProductResponse,
  UpdateProductInput,
  UpdateProductStatusInput,
} from "../../types/product.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Normalises variants to plain JSON so Prisma can store them portably. */
const normalizeVariants = (
  sizes?: string[],
  colors?: ProductColorOption[],
): { sizes: string[]; colors: ProductColorOption[] } => ({
  sizes: Array.from(
    new Set((sizes ?? []).map((size) => size.trim()).filter(Boolean)),
  ).slice(0, 30),
  colors: Array.from(
    new Map(
      (colors ?? [])
        .map((color) => ({
          name: color.name.trim(),
          hex: color.hex.trim().toLowerCase(),
        }))
        .filter(
          (color) => color.name.length > 0 && HEX_COLOR_PATTERN.test(color.hex),
        )
        .map((color) => [`${color.name}|${color.hex}`, color] as const),
    ).values(),
  ).slice(0, 30),
});

const readSizes = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const readColors = (value: Prisma.JsonValue): ProductColorOption[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): ProductColorOption[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.name !== "string" ||
      typeof candidate.hex !== "string" ||
      !HEX_COLOR_PATTERN.test(candidate.hex)
    ) {
      return [];
    }
    return [{ name: candidate.name, hex: candidate.hex }];
  });
};

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

const isSlugTaken = async (
  slug: string,
  excludeProductId?: string,
): Promise<boolean> => {
  const product = await prisma.product.findFirst({
    where: {
      slug,
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
    select: { id: true },
  });

  return product !== null;
};

const isSkuTaken = async (
  sku: string,
  excludeProductId?: string,
): Promise<boolean> => {
  const product = await prisma.product.findFirst({
    where: {
      sku,
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
    select: { id: true },
  });

  return product !== null;
};

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
    isActive: product.status === ProductStatus.ACTIVE,
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
    sizes: readSizes(product.sizes),
    colors: readColors(product.colors),
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
  if (input.slug !== undefined && !slugify(input.slug)) {
    throw ApiError.badRequest("Product slug is invalid");
  }

  if (
    input.discountPrice !== undefined &&
    input.discountPrice !== null &&
    input.discountPrice >= input.price
  ) {
    throw ApiError.badRequest("Discount price must be lower than the regular price");
  }

  const slug = await generateUniqueSlug(
    input.slug ?? input.title,
    (candidate) => isSlugTaken(candidate),
  );

  const providedSku = input.sku?.trim();

  if (providedSku && (await isSkuTaken(providedSku))) {
    throw ApiError.conflict("A product with this SKU already exists");
  }

  const sku = providedSku || (await generateUniqueSku((candidate) => isSkuTaken(candidate)));

  await ensureCategoryExists(input.categoryId);

  const brandId = await resolveBrandId(input.brandId, input.brandName);
  const hasImages =
    (input.images && input.images.length > 0) ||
    Boolean(input.thumbnail?.trim());
  const images = hasImages
    ? buildProductImages(input.images, input.thumbnail)
    : [];
  const status = input.status ?? ProductStatus.ACTIVE;
  const variants = normalizeVariants(input.sizes, input.colors);

  if (images.length === 0 && status !== ProductStatus.DRAFT) {
    throw ApiError.badRequest(
      "At least one product image is required unless the product is saved as a draft",
    );
  }

  const product = await prisma.product.create({
    data: {
      title: input.title.trim(),
      slug,
      sku,
      description: input.description.trim(),
      shortDescription: input.shortDescription?.trim() || null,
      price: toDecimal(input.price),
      discountPrice:
        input.discountPrice !== undefined && input.discountPrice !== null
          ? toDecimal(input.discountPrice)
          : null,
      costPrice:
        input.costPrice !== undefined && input.costPrice !== null
          ? toDecimal(input.costPrice)
          : null,
      purchasePrice: toDecimal(
        input.purchasePrice ?? input.costPrice ?? 0,
      ),
      stock: input.stock,
      minimumStockLevel: input.minimumStockLevel ?? 5,
      status: status,
      isFeatured: input.isFeatured ?? false,
      category: { connect: { id: input.categoryId } },
      brand: brandId ? { connect: { id: brandId } } : undefined,
      modelUrl: input.modelUrl?.trim() || null,
      sizes: variants.sizes as Prisma.InputJsonValue,
      colors: variants.colors as unknown as Prisma.InputJsonValue,
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
  const wantsInactive =
    query.includeInactive === true ||
    query.isActive === false ||
    (query.status !== undefined && query.status !== ProductStatus.ACTIVE);

  if (!canViewAllStatuses) {
    if (wantsInactive) {
      throw ApiError.forbidden(
        "Only administrators can view or filter inactive products",
      );
    }

    where.archivedAt = null;
    where.status = ProductStatus.ACTIVE;
  } else if (query.includeInactive) {
    // Administrators explicitly requested products across all statuses.
  } else if (query.status !== undefined) {
    where.status = query.status;
  } else if (typeof query.isActive === "boolean") {
    where.status = query.isActive
      ? ProductStatus.ACTIVE
      : { not: ProductStatus.ACTIVE };
  }

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { shortDescription: { contains: query.search, mode: "insensitive" } },
      { sku: { contains: query.search, mode: "insensitive" } },
      { slug: { contains: query.search, mode: "insensitive" } },
      {
        category: {
          is: { name: { contains: query.search, mode: "insensitive" } },
        },
      },
      {
        brand: {
          is: { name: { contains: query.search, mode: "insensitive" } },
        },
      },
    ];
  }

  const categoryFilter = query.categoryId ?? query.category;

  if (categoryFilter) {
    if (UUID_PATTERN.test(categoryFilter)) {
      where.categoryId = categoryFilter;
    } else {
      where.category = { is: { slug: categoryFilter } };
    }
  }

  const brandFilter = query.brandId ?? query.brand;

  if (brandFilter) {
    if (UUID_PATTERN.test(brandFilter)) {
      where.brandId = brandFilter;
    } else {
      where.brand = { is: { slug: brandFilter } };
    }
  }

  const featuredFilter = query.isFeatured ?? query.featured;

  if (typeof featuredFilter === "boolean") {
    where.isFeatured = featuredFilter;
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

  if (input.slug !== undefined || input.title !== undefined) {
    if (input.slug !== undefined && !slugify(input.slug)) {
      throw ApiError.badRequest("Product slug is invalid");
    }

    data.slug = await generateUniqueSlug(
      input.slug ?? input.title!,
      (candidate) => isSlugTaken(candidate, productId),
    );
  }

  if (input.sku !== undefined) {
    const sku = input.sku.trim();

    if (await isSkuTaken(sku, productId)) {
      throw ApiError.conflict("A product with this SKU already exists");
    }

    data.sku = sku;
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

  if (input.sizes !== undefined || input.colors !== undefined) {
    const variants = normalizeVariants(input.sizes, input.colors);

    if (input.sizes !== undefined) {
      data.sizes = variants.sizes as Prisma.InputJsonValue;
    }
    if (input.colors !== undefined) {
      data.colors = variants.colors as unknown as Prisma.InputJsonValue;
    }
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

export const updateProductStatus = async (
  actorId: string,
  productId: string,
  input: UpdateProductStatusInput,
  ipAddress?: string,
): Promise<ProductResponse> => {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, status: true, archivedAt: true },
  });

  if (!existing) {
    throw ApiError.notFound("Product not found");
  }

  const nextStatus =
    input.status ??
    (input.isActive === true ? ProductStatus.ACTIVE : ProductStatus.INACTIVE);

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      status: nextStatus,
      ...(nextStatus === ProductStatus.ACTIVE ? { archivedAt: null } : {}),
    },
    include: productInclude,
  });

  await recordAudit({
    userId: actorId,
    action:
      nextStatus === ProductStatus.ACTIVE
        ? "ENABLE_PRODUCT"
        : "DISABLE_PRODUCT",
    entity: "Product",
    entityId: product.id,
    description: `Changed status for product ${product.title} from ${existing.status} to ${nextStatus}`,
    oldData: {
      status: existing.status,
      archivedAt: existing.archivedAt?.toISOString() ?? null,
    },
    newData: {
      status: product.status,
      archivedAt: product.archivedAt?.toISOString() ?? null,
    },
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

  const isForeignKeyError = (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003";

  const archiveProduct = async (): Promise<void> => {
    const archivedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          status: ProductStatus.INACTIVE,
          archivedAt,
          isFeatured: false,
        },
      });

      await tx.productDiscount.updateMany({
        where: { productId },
        data: { isActive: false },
      });

      // Remove storefront references while keeping the product (and its order
      // history) available to administrators.
      await tx.cartItem.deleteMany({ where: { productId } });
      await tx.wishlist.deleteMany({ where: { productId } });
    });

    await recordAudit({
      userId: actorId,
      action: "ARCHIVE_PRODUCT",
      entity: "Product",
      entityId: productId,
      description: `Archived product ${product.title} because it appears in order history`,
      oldData: {
        id: product.id,
        title: product.title,
        status: product.status,
        archivedAt: product.archivedAt?.toISOString() ?? null,
      },
      newData: {
        id: productId,
        title: product.title,
        status: ProductStatus.INACTIVE,
        archivedAt: archivedAt.toISOString(),
      },
      ipAddress,
    });
  };

  const orderItemCount = await prisma.orderItem.count({
    where: { productId },
  });

  if (orderItemCount > 0) {
    await archiveProduct();
    return;
  }

  const publicIds = product.images
    .map((image) => image.publicId)
    .filter((publicId): publicId is string => Boolean(publicId));

  try {
    await prisma.$transaction(async (tx) => {
      // Clear every dependent row explicitly so foreign keys never block the
      // delete, even when database cascade rules are missing.
      await tx.productDiscount.deleteMany({ where: { productId } });
      await tx.review.deleteMany({ where: { productId } });
      await tx.cartItem.deleteMany({ where: { productId } });
      await tx.wishlist.deleteMany({ where: { productId } });
      await tx.inventoryLog.deleteMany({ where: { productId } });
      await tx.productImage.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
    });
  } catch (error) {
    // A concurrent order could reference the product between the count and the
    // delete. Archive instead of surfacing a raw foreign-key error.
    if (isForeignKeyError(error)) {
      await archiveProduct();
      return;
    }

    throw error;
  }

  if (isCloudinaryConfigured && publicIds.length > 0) {
    await Promise.allSettled(
      publicIds.map(async (publicId) => {
        try {
          await deleteCloudinaryImage(publicId);
        } catch (error) {
          console.error(
            `Failed to delete Cloudinary image ${publicId}:`,
            error,
          );
        }
      }),
    );
  }

  await recordAudit({
    userId: actorId,
    action: "DELETE_PRODUCT",
    entity: "Product",
    entityId: productId,
    description: `Deleted product ${product.title}`,
    oldData: {
      id: product.id,
      title: product.title,
      slug: product.slug,
      sku: product.sku,
      status: product.status,
    },
    ipAddress,
  });
};
