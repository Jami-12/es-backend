import { z } from "zod";

import { PRODUCT_SIZES } from "../utils/product-options";

export const addCartItemSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  quantity: z.coerce
    .number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(1000, "Quantity per item cannot exceed 1000"),
  selectedSize: z
    .union([z.literal(""), z.enum(PRODUCT_SIZES)])
    .optional()
    .default(""),
  selectedColor: z.string().trim().max(60).optional().default(""),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce
    .number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(1000, "Quantity per item cannot exceed 1000"),
});
