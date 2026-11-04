import { PaymentMethod } from "@prisma/client";
import { z } from "zod";

export const confirmPaymentSchema = z.object({
  transactionId: z.string().trim().min(4).max(120).optional(),
  providerReference: z.string().trim().min(1).max(160).optional(),
});

export const failPaymentSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const paymentWebhookSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  status: z.enum(["PAID", "FAILED"]),
  transactionId: z.string().trim().min(4).max(120).optional(),
  providerReference: z.string().trim().min(1).max(160).optional(),
});

export const initiatePaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
  method: z.nativeEnum(PaymentMethod).optional(),
});

export const reconcileCardPaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order id"),
});

export const paymentProviderParamSchema = z.object({
  method: z.enum(["BKASH", "NAGAD", "CARD"]),
});
