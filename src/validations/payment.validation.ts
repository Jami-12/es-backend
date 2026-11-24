import { PaymentMethod } from "@prisma/client";
import { z } from "zod";

import { emptyToUndefined } from "./helpers";

const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

export const confirmPaymentSchema = z.object({
  transactionId: optionalString(z.string().trim().min(4).max(120)),
  providerReference: optionalString(z.string().trim().min(1).max(160)),
});

export const failPaymentSchema = z.object({
  reason: z.string().trim().max(500).nullish(),
});

export const paymentWebhookSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  status: z.enum(["PAID", "FAILED"]),
  transactionId: optionalString(z.string().trim().min(4).max(120)),
  providerReference: optionalString(z.string().trim().min(1).max(160)),
});

export const initiatePaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  method: z.nativeEnum(PaymentMethod).optional(),
});

const guestTokenSchema = z
  .string()
  .trim()
  .min(20, "Invalid guest order token")
  .max(80);

export const createBkashPaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  guestToken: guestTokenSchema.optional(),
});

export const guestInitiatePaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  guestToken: guestTokenSchema,
  method: z.nativeEnum(PaymentMethod).optional(),
});

export const guestReconcileCardPaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  guestToken: guestTokenSchema,
});

export const reconcileCardPaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
});

export const paymentProviderParamSchema = z.object({
  method: z.enum(["BKASH", "NAGAD", "CARD"]),
});
