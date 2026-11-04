import { DiscountType, ProductStatus } from "@prisma/client";
import { z } from "zod";

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

const imageUrlSchema = z
  .string()
  .trim()
  .min(1, "Image URL cannot be empty")
  .max(2000);

const imageSchema = z
  .object({
    url: imageUrlSchema.optional(),
    imageUrl: imageUrlSchema.optional(),
    publicId: z.string().trim().max(255).optional(),
    altText: z.string().trim().max(255).optional(),
    isPrimary: z.boolean().optional(),
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
    slug: z.string().trim().min(2).max(220).optional(),
    sku: z
      .string()
      .trim()
      .min(1, "SKU is required")
      .max(80, "SKU must contain at most 80 characters"),
    description: z
      .string()
      .trim()
      .min(10, "Description must contain at least 10 characters")
      .max(20_000, "Description must contain at most 20000 characters"),
    shortDescription: z.string().trim().max(500).optional(),
    price: positiveMoneySchema,
    discountPrice: moneySchema.optional(),
    costPrice: moneySchema.optional(),
    purchasePrice: moneySchema.optional(),
    stock: z.coerce
      .number()
      .int("Stock must be an integer")
      .min(0, "Stock cannot be negative")
      .max(10_000_000, "Stock is too large"),
    minimumStockLevel: z.coerce.number().int().min(0).max(1_000_000).optional(),
    status: z.nativeEnum(ProductStatus).optional(),
    isFeatured: z.boolean().optional(),
    categoryId: z.string().uuid("Invalid category id"),
    brandId: z.string().uuid("Invalid brand id").optional(),
    brandName: z.string().trim().min(1).max(120).optional(),
    modelUrl: z.string().trim().max(2000).optional(),
    positionX: coordinateSchema.default(0),
    positionY: coordinateSchema.default(0),
    positionZ: coordinateSchema.default(0),
    rotationX: rotationSchema.default(0),
    rotationY: rotationSchema.default(0),
    rotationZ: rotationSchema.default(0),
    scale: scaleSchema.default(1),
    images: z
      .array(imageSchema)
      .min(1, "At least one product image is required")
      .max(20, "A product can have at most 20 images")
      .optional(),
    thumbnail: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.discountPrice !== undefined &&
      value.discountPrice >= value.price
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountPrice"],
        message: "Discount price must be lower than the regular price",
      });
    }

    if (!value.images && !value.thumbnail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["images"],
        message: "Provide at least one product image or a thumbnail",
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
      slug: z.string().trim().min(2).max(220).optional(),
      sku: z.string().trim().min(1).max(80).optional(),
      description: z.string().trim().min(10).max(20_000).optional(),
      shortDescription: z.string().trim().max(500).nullable().optional(),
      price: positiveMoneySchema.optional(),
      discountPrice: moneySchema.nullable().optional(),
      costPrice: moneySchema.nullable().optional(),
      purchasePrice: moneySchema.nullable().optional(),
      stock: z.coerce.number().int().min(0).max(10_000_000).optional(),
      minimumStockLevel: z.coerce
        .number()
        .int()
        .min(0)
        .max(1_000_000)
        .optional(),
      status: z.nativeEnum(ProductStatus).optional(),
      isFeatured: z.boolean().optional(),
      categoryId: z.string().uuid("Invalid category id").optional(),
      brandId: z.string().uuid("Invalid brand id").nullable().optional(),
      brandName: z.string().trim().min(1).max(120).nullable().optional(),
      modelUrl: z.string().trim().max(2000).nullable().optional(),
      positionX: coordinateSchema.optional(),
      positionY: coordinateSchema.optional(),
      positionZ: coordinateSchema.optional(),
      rotationX: rotationSchema.optional(),
      rotationY: rotationSchema.optional(),
      rotationZ: rotationSchema.optional(),
      scale: scaleSchema.optional(),
      images: z.array(imageSchema).min(1).max(20).optional(),
      thumbnail: z.string().trim().min(1).max(2000).nullable().optional(),
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

export const productListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(200).optional(),
    category: z.string().trim().max(200).optional(),
    brand: z.string().trim().max(200).optional(),
    minPrice: z.coerce.number().finite().min(0).optional(),
    maxPrice: z.coerce.number().finite().min(0).optional(),
    status: z.nativeEnum(ProductStatus).optional(),
    featured: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    inStock: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
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
    isActive: z.boolean().optional(),
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
    isActive: z.boolean().optional(),
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
  altText: z.string().trim().max(255).optional(),
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
