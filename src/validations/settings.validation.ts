import { DiscountType } from "@prisma/client";
import { z } from "zod";

import { assetUrlSchema, booleanishSchema, emptyToUndefined, nullableTextSchema } from "./helpers";

/**
 * `multipart/form-data` can only send strings, so the category section list is
 * accepted both as a real JSON array and as a JSON-encoded string.
 */
const parseCategorySections = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Return the original value so Zod reports a helpful type error.
    return value;
  }
};

const categorySectionSchema = z.object({
  categoryId: z.string().uuid("Invalid category id"),
  isVisible: booleanishSchema.default(true),
  sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
});

/** Empty strings mean "no change"; an explicit null clears the logo. */
const nullableLogoUrlSchema = z.preprocess((value) => {
  if (value === null || value === "null") {
    return null;
  }

  return emptyToUndefined(value);
}, assetUrlSchema.nullable().optional());

const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Verification code must be exactly 6 digits");

const nullableMoneySchema = z.preprocess((value) => {
  if (value === null || value === "null") {
    return null;
  }

  return emptyToUndefined(value);
}, z.coerce.number().min(0).nullable().optional());

const nullableDiscountTypeSchema = z.preprocess((value) => {
  if (value === null || value === "null") {
    return null;
  }

  return emptyToUndefined(value);
}, z.nativeEnum(DiscountType).nullable().optional());

export const updateSettingsSchema = z
  .object({
    siteName: nullableTextSchema(120, "Site name"),
    navbarLogoUrl: nullableLogoUrlSchema,
    navbarLogoPublicId: nullableTextSchema(255, "Logo public id"),
    showHero: booleanishSchema.optional(),
    showProductFinder: booleanishSchema.optional(),
    showMiddleCategories: booleanishSchema.optional(),
    showCategorySections: booleanishSchema.optional(),
    showNewArrivals: booleanishSchema.optional(),
    showBrands: booleanishSchema.optional(),
    showPromoBanners: booleanishSchema.optional(),
    showNewsletter: booleanishSchema.optional(),
    codEnabled: booleanishSchema.optional(),
    bkashEnabled: booleanishSchema.optional(),
    nagadEnabled: booleanishSchema.optional(),
    stripeEnabled: booleanishSchema.optional(),
    shippingEnabled: booleanishSchema.optional(),
    shippingFee: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
    freeShippingThreshold: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0).optional(),
    ),
    flatDiscountEnabled: booleanishSchema.optional(),
    flatDiscountType: nullableDiscountTypeSchema,
    flatDiscountValue: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0).optional(),
    ),
    flatDiscountMinAmount: nullableMoneySchema,
    categorySections: z.preprocess(
      parseCategorySections,
      z.array(categorySectionSchema).optional(),
    ),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting must be provided for update",
  })
  .superRefine((value, ctx) => {
    if (
      value.flatDiscountEnabled &&
      !value.flatDiscountType &&
      value.flatDiscountType !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["flatDiscountType"],
        message: "Choose percentage or fixed amount for the store-wide discount",
      });
    }

    if (
      value.flatDiscountType === DiscountType.PERCENTAGE &&
      value.flatDiscountValue !== undefined &&
      value.flatDiscountValue > 100
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["flatDiscountValue"],
        message: "Percentage discount cannot exceed 100",
      });
    }
  });

export const verifyDataResetCodeSchema = z.object({
  code: verificationCodeSchema,
});

export const DATA_RESET_CONFIRMATION = "DELETE ALL DATA";

export const executeDataResetSchema = z.object({
  verificationToken: z
    .string()
    .trim()
    .min(1, "Verification token is required"),
  confirmation: z
    .string()
    .refine(
      (value) => value === DATA_RESET_CONFIRMATION,
      `Type "${DATA_RESET_CONFIRMATION}" exactly to confirm the data wipe`,
    ),
});
