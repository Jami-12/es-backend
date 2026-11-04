import { z } from "zod";

export const addCartItemSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  quantity: z.coerce
    .number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(1000, "Quantity per item cannot exceed 1000"),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce
    .number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(1000, "Quantity per item cannot exceed 1000"),
});
