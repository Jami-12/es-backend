import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max, `Value must contain at most ${max} characters`);

export const createBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Brand name must contain at least 2 characters")
    .max(120, "Brand name must contain at most 120 characters"),
  slug: optionalText(160).optional(),
  logo: optionalText(2000).optional(),
  description: optionalText(5000).optional(),
});

export const updateBrandSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Brand name must contain at least 2 characters")
      .max(120, "Brand name must contain at most 120 characters")
      .optional(),
    slug: optionalText(160).optional(),
    logo: optionalText(2000).nullable().optional(),
    description: optionalText(5000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const brandListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});
