import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import { z } from "zod";

export const checkoutSchema = z.object({
  addressId: z.string().uuid("Invalid address id"),
  paymentMethod: z.nativeEnum(PaymentMethod),
  couponCode: z.string().trim().min(2).max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(OrderStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  userId: z.string().uuid("Invalid user id").optional(),
  search: z.string().trim().max(100).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
