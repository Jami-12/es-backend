import { z } from "zod";

import {
  booleanishSchema,
  nullableTextSchema,
  optionalTextSchema,
} from "./helpers";

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name must contain at least 2 characters")
    .max(120, "Category name must contain at most 120 characters"),
  slug: optionalTextSchema(2, 160, "Slug"),
  description: nullableTextSchema(5000, "Description"),
  image: nullableTextSchema(2000, "Image"),
  isActive: booleanishSchema.optional(),
});

export const updateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Category name must contain at least 2 characters")
      .max(120, "Category name must contain at most 120 characters")
      .optional(),
    slug: optionalTextSchema(2, 160, "Slug"),
    description: nullableTextSchema(5000, "Description"),
    image: nullableTextSchema(2000, "Image"),
    isActive: booleanishSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateCategoryStatusSchema = z.object({
  isActive: booleanishSchema,
});

export const categoryListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
