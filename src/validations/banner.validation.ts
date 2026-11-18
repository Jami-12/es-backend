import { BannerPlacement } from "@prisma/client";
import { z } from "zod";

import {
  assetUrlSchema,
  booleanishSchema,
  linkUrlSchema,
  nullableTextSchema,
} from "./helpers";

export const createBannerSchema = z
  .object({
    title: z.string().trim().min(2, "Title is required").max(160),
    subtitle: nullableTextSchema(300, "Subtitle"),
    imageUrl: assetUrlSchema.optional(),
    publicId: nullableTextSchema(255, "Public id"),
    linkUrl: linkUrlSchema,
    placement: z.nativeEnum(BannerPlacement).default(BannerPlacement.PROMO),
    isActive: booleanishSchema.default(true),
    sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .superRefine((value, ctx) => {
    if (!value.imageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["imageUrl"],
        message:
          'Upload an image file using the "image" or "file" field, or provide an imageUrl',
      });
    }
  });

export const updateBannerSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    subtitle: nullableTextSchema(300, "Subtitle"),
    imageUrl: assetUrlSchema.optional(),
    publicId: nullableTextSchema(255, "Public id"),
    linkUrl: linkUrlSchema,
    placement: z.nativeEnum(BannerPlacement).optional(),
    isActive: booleanishSchema.optional(),
    sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateBannerStatusSchema = z.object({
  isActive: booleanishSchema,
});

export const bannerListQuerySchema = z.object({
  placement: z.nativeEnum(BannerPlacement).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
