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
    categorySections: z.preprocess(
      parseCategorySections,
      z.array(categorySectionSchema).optional(),
    ),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting must be provided for update",
  });
