import { InventoryMovementType, ProductStatus } from "@prisma/client";
import { z } from "zod";

export const inventoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  categoryId: z.string().uuid("Invalid category id").optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  lowStockOnly: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sortBy: z.enum(["stock", "stockValue", "title", "updatedAt"]).default("stock"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const adjustStockSchema = z
  .object({
    movementType: z.nativeEnum(InventoryMovementType),
    quantity: z.coerce.number().int().min(0).max(1_000_000),
    reason: z.string().trim().max(500).nullish(),
  })
  .refine(
    (value) =>
      value.movementType === InventoryMovementType.ADJUSTMENT ||
      value.quantity > 0,
    {
      message: "Quantity must be greater than zero for stock in/out movements",
      path: ["quantity"],
    },
  );

export const inventoryLogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  productId: z.string().uuid("Invalid product id").optional(),
  movementType: z.nativeEnum(InventoryMovementType).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const inventoryProductParamSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
});
