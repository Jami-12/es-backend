import { z } from "zod";

import {
  booleanishSchema,
  nullableTextSchema,
  optionalTextSchema,
} from "./helpers";

export const createBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Brand name must contain at least 2 characters")
    .max(120, "Brand name must contain at most 120 characters"),
  slug: optionalTextSchema(2, 160, "Slug"),
  logo: nullableTextSchema(2000, "Logo"),
  description: nullableTextSchema(5000, "Description"),
  isActive: booleanishSchema.optional(),
});

export const updateBrandSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Brand name must contain at least 2 characters")
      .max(120, "Brand name must contain at most 120 characters")
      .optional(),
    slug: optionalTextSchema(2, 160, "Slug"),
    logo: nullableTextSchema(2000, "Logo"),
    description: nullableTextSchema(5000, "Description"),
    isActive: booleanishSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateBrandStatusSchema = z.object({
  isActive: booleanishSchema,
});

export const brandListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
