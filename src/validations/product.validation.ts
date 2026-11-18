import { DiscountType, ProductStatus } from "@prisma/client";
import { z } from "zod";

import {
  booleanishSchema,
  emptyToUndefined,
  nullableTextSchema,
  optionalInputSchema,
  optionalTextSchema,
} from "./helpers";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const moneySchema = z.coerce
  .number()
  .finite("Price must be a valid number")
  .min(0, "Price cannot be negative")
  .max(99_999_999.99, "Price is too large")
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
    "Price supports a maximum of two decimal places",
  );

const positiveMoneySchema = moneySchema.refine(
  (value) => value > 0,
  "Price must be greater than zero",
);

const coordinateSchema = z.coerce
  .number()
  .finite("Coordinate must be a valid number")
  .min(-10_000, "Coordinate is out of range")
  .max(10_000, "Coordinate is out of range");

const rotationSchema = z.coerce
  .number()
  .finite("Rotation must be a valid number")
  .min(-360, "Rotation must be between -360 and 360")
  .max(360, "Rotation must be between -360 and 360");

const scaleSchema = z.coerce
  .number()
  .finite("Scale must be a valid number")
  .min(0.0001, "Scale must be greater than zero")
  .max(1000, "Scale is too large");

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const imageUrlSchema = z.string().trim().max(2000);

const thumbnailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? null : value,
  z
    .string()
    .trim()
    .min(1, "Thumbnail cannot be empty")
    .max(2000)
    .nullable()
    .optional(),
);

const modelUrlSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().trim().max(2000).nullable().optional(),
);

const imageSchema = z
  .object({
    url: imageUrlSchema.nullish(),
    imageUrl: imageUrlSchema.nullish(),
    publicId: z.string().trim().max(255).nullish(),
    altText: z.string().trim().max(255).nullish(),
    isPrimary: booleanishSchema.optional(),
    sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.url && !value.imageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "An image URL is required",
      });
    }
  });

const normalizeProductAliases = (raw: unknown): unknown => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const value = { ...(raw as Record<string, unknown>) };

  if (value.title === undefined && typeof value.name === "string") {
    value.title = value.name;
  }

  if (value.price === undefined && value.sellingPrice !== undefined) {
    value.price = value.sellingPrice;
  }

  if (value.brandId === undefined && value.brand !== undefined) {
    if (value.brand === null) {
      value.brandId = null;
    } else if (typeof value.brand === "string" && value.brand.trim()) {
      const brand = value.brand.trim();
      value.brandId = UUID_PATTERN.test(brand) ? brand : undefined;
      value.brandName = UUID_PATTERN.test(brand) ? undefined : brand;
    }
  }

  const positionAliases: [string, string][] = [
    ["wallPositionX", "positionX"],
    ["wallPositionY", "positionY"],
    ["wallPositionZ", "positionZ"],
  ];

  for (const [alias, field] of positionAliases) {
    if (value[field] === undefined && value[alias] !== undefined) {
      value[field] = value[alias];
    }
  }

  if (Array.isArray(value.images)) {
    value.images = value.images.map((image) => {
      if (typeof image === "string") {
        return { url: image, imageUrl: image };
      }

      if (!image || typeof image !== "object" || Array.isArray(image)) {
        return image;
      }

      const copy = { ...(image as Record<string, unknown>) };

      if (copy.url === undefined && copy.imageUrl !== undefined) {
        copy.url = copy.imageUrl;
      }

      if (copy.imageUrl === undefined && copy.url !== undefined) {
        copy.imageUrl = copy.url;
      }

      return copy;
    });
  }

  return value;
};

const productPayloadSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Title must contain at least 2 characters")
      .max(200, "Title must contain at most 200 characters"),
    slug: optionalTextSchema(2, 220, "Slug"),
    sku: optionalTextSchema(1, 80, "SKU"),
    description: z
      .string()
      .trim()
      .min(10, "Description must contain at least 10 characters")
      .max(20_000, "Description must contain at most 20000 characters"),
    shortDescription: z.string().trim().max(500).nullish(),
    price: positiveMoneySchema,
    discountPrice: optionalInputSchema(moneySchema),
    costPrice: optionalInputSchema(moneySchema),
    purchasePrice: optionalInputSchema(moneySchema),
    stock: z.coerce
      .number()
      .int("Stock must be an integer")
      .min(0, "Stock cannot be negative")
      .max(10_000_000, "Stock is too large"),
    minimumStockLevel: z.coerce.number().int().min(0).max(1_000_000).optional(),
    status: z.nativeEnum(ProductStatus).optional(),
    isFeatured: booleanishSchema.optional(),
    categoryId: z.string().uuid("Invalid category id"),
    brandId: z.string().uuid("Invalid brand id").nullish(),
    brandName: nullableTextSchema(120, "Brand name"),
    modelUrl: modelUrlSchema.default(null),
    positionX: coordinateSchema.default(0),
    positionY: coordinateSchema.default(0),
    positionZ: coordinateSchema.default(0),
    rotationX: rotationSchema.default(0),
    rotationY: rotationSchema.default(0),
    rotationZ: rotationSchema.default(0),
    scale: scaleSchema.default(1),
    images: z.preprocess(
      emptyToUndefined,
      z
        .array(imageSchema)
        .min(1, "At least one product image is required")
        .max(20, "A product can have at most 20 images")
        .optional(),
    ),
    thumbnail: thumbnailSchema,
  })
  .superRefine((value, ctx) => {
    if (
      value.discountPrice !== undefined &&
      value.discountPrice !== null &&
      value.discountPrice >= value.price
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountPrice"],
        message: "Discount price must be lower than the regular price",
      });
    }

    if (!value.images && !value.thumbnail && value.status !== ProductStatus.DRAFT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["images"],
        message:
          "Provide at least one product image or a thumbnail, or save the product as a draft",
      });
    }

    if (value.brandId && value.brandName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["brand"],
        message: "Provide either brandId or brand, not both",
      });
    }
  });

export const createProductSchema = z.preprocess(
  normalizeProductAliases,
  productPayloadSchema,
);

export const updateProductSchema = z.preprocess(
  normalizeProductAliases,
  z
    .object({
      title: z.string().trim().min(2).max(200).optional(),
      slug: optionalTextSchema(2, 220, "Slug"),
      sku: optionalTextSchema(1, 80, "SKU"),
      description: z.string().trim().min(10).max(20_000).optional(),
      shortDescription: z.string().trim().max(500).nullish(),
      price: positiveMoneySchema.optional(),
      discountPrice: optionalInputSchema(moneySchema),
      costPrice: optionalInputSchema(moneySchema),
      purchasePrice: optionalInputSchema(moneySchema),
      stock: z.coerce.number().int().min(0).max(10_000_000).optional(),
      minimumStockLevel: z.coerce
        .number()
        .int()
        .min(0)
        .max(1_000_000)
        .optional(),
      status: z.nativeEnum(ProductStatus).optional(),
      isFeatured: booleanishSchema.optional(),
      categoryId: z.string().uuid("Invalid category id").optional(),
      brandId: z.string().uuid("Invalid brand id").nullish(),
      brandName: nullableTextSchema(120, "Brand name"),
      modelUrl: modelUrlSchema,
      positionX: coordinateSchema.optional(),
      positionY: coordinateSchema.optional(),
      positionZ: coordinateSchema.optional(),
      rotationX: rotationSchema.optional(),
      rotationY: rotationSchema.optional(),
      rotationZ: rotationSchema.optional(),
      scale: scaleSchema.optional(),
      images: z.preprocess(
        emptyToUndefined,
        z.array(imageSchema).min(1).max(20).optional(),
      ),
      thumbnail: thumbnailSchema,
    })
    .superRefine((value, ctx) => {
      if (
        value.discountPrice !== undefined &&
        value.discountPrice !== null &&
        value.price !== undefined &&
        value.discountPrice >= value.price
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["discountPrice"],
          message: "Discount price must be lower than the regular price",
        });
      }

      if (value.brandId && value.brandName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["brand"],
          message: "Provide either brandId or brand, not both",
        });
      }
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field must be provided for update",
    }),
);

export const updateProductStatusSchema = z
  .object({
    status: z.nativeEnum(ProductStatus).optional(),
    isActive: booleanishSchema.optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.isActive !== undefined,
    {
      message: "Provide status or isActive",
    },
  );

export const productListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    category: z.string().trim().max(200).optional(),
    brand: z.string().trim().max(200).optional(),
    categoryId: z.string().uuid("Invalid category id").optional(),
    brandId: z.string().uuid("Invalid brand id").optional(),
    minPrice: z.coerce.number().finite().min(0).optional(),
    maxPrice: z.coerce.number().finite().min(0).optional(),
    status: z.nativeEnum(ProductStatus).optional(),
    isActive: booleanQuerySchema.optional(),
    isFeatured: booleanQuerySchema.optional(),
    featured: booleanQuerySchema.optional(),
    includeInactive: booleanQuerySchema.default(false),
    inStock: booleanQuerySchema.optional(),
    sortBy: z
      .enum(["createdAt", "price", "title", "soldCount"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    {
      message: "minPrice cannot be greater than maxPrice",
      path: ["minPrice"],
    },
  );

export const productIdParamSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
});

const discountValueSchema = z.coerce
  .number()
  .finite("Discount value must be a valid number")
  .min(0, "Discount value cannot be negative")
  .max(99_999_999.99, "Discount value is too large");

export const createProductDiscountSchema = z
  .object({
    discountType: z.nativeEnum(DiscountType),
    discountValue: discountValueSchema,
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date(),
    isActive: booleanishSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.discountType === DiscountType.PERCENTAGE &&
      (value.discountValue <= 0 || value.discountValue > 100)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percentage discount must be greater than 0 and at most 100",
      });
    }

    if (value.startDate && value.endDate <= value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be after the start date",
      });
    }
  });

export const updateProductDiscountSchema = z
  .object({
    discountType: z.nativeEnum(DiscountType).optional(),
    discountValue: discountValueSchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    isActive: booleanishSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  })
  .superRefine((value, ctx) => {
    if (
      value.discountType === DiscountType.PERCENTAGE &&
      value.discountValue !== undefined &&
      (value.discountValue <= 0 || value.discountValue > 100)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percentage discount must be greater than 0 and at most 100",
      });
    }

    if (value.startDate && value.endDate && value.endDate <= value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be after the start date",
      });
    }
  });

const booleanStringSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const parseAltTexts = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return trimmed.split(",").map((item) => item.trim());
};

export const productImageUploadSchema = z.object({
  altText: z.string().trim().max(255).nullish(),
  altTexts: z.preprocess(
    parseAltTexts,
    z.array(z.string().trim().max(255)).max(20).optional(),
  ),
  isPrimary: booleanStringSchema.optional(),
});

export const updateProductImageSchema = z
  .object({
    altText: z.string().trim().max(255).nullable().optional(),
    isPrimary: booleanStringSchema.optional(),
    sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const reorderProductImagesSchema = z.object({
  imageIds: z
    .array(z.string().uuid("Invalid image id"))
    .min(1, "Provide at least one image id")
    .max(20, "A product can have at most 20 images"),
});

export const productImageParamSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  imageId: z.string().uuid("Invalid image id"),
});
