import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import { z } from "zod";

const parsePaymentMethod = (val: unknown): unknown => {
  if (val === undefined || val === null || val === "") return val;
  const normalized = String(val).trim().toUpperCase().replace(/[\s-_]+/g, "");
  if (normalized === "BKASH") return PaymentMethod.BKASH;
  if (normalized === "NAGAD") return PaymentMethod.NAGAD;
  if (normalized === "STRIPE" || normalized === "CARD") return PaymentMethod.CARD;
  if (normalized === "COD" || normalized === "CASHONDELIVERY") return PaymentMethod.CASH_ON_DELIVERY;
  return val;
};

export const paymentMethodSchema = z.preprocess(
  parsePaymentMethod,
  z.nativeEnum(PaymentMethod, {
    message: "Invalid payment method. Choose bKash, COD, Nagad, or Stripe.",
  }),
);

const emptyToUndefined = (val: unknown): unknown => {
  if (
    val === "" ||
    val === null ||
    val === "null" ||
    val === "undefined" ||
    val === "ALL" ||
    val === "all"
  ) {
    return undefined;
  }
  return val;
};

const optionalCheckoutText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (!value || value === "" ? undefined : value));

const checkoutBaseSchema = {
  paymentMethod: paymentMethodSchema,
  couponCode: optionalCheckoutText(50),
  notes: optionalCheckoutText(2000),
};

export const checkoutSchema = z
  .object({
    ...checkoutBaseSchema,
    addressId: z.string().uuid("Invalid address id"),
  })
  .strict();

const guestContactSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(30),
  email: z
    .union([z.string().trim().email("Enter a valid email address"), z.literal("")])
    .optional()
    .transform((value) => (!value ? undefined : value)),
  addressLine: z.string().trim().min(5, "Enter your delivery address").max(500),
  division: optionalCheckoutText(120),
  district: z.string().trim().min(2, "Enter your district").max(120),
  area: optionalCheckoutText(120),
  postalCode: optionalCheckoutText(30),
});

const guestItemSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
  quantity: z.coerce.number().int().min(1).max(99),
  size: optionalCheckoutText(60),
  color: optionalCheckoutText(60),
});

export const guestCheckoutSchema = z
  .object({
    ...checkoutBaseSchema,
    guest: z.object({
      customer: guestContactSchema,
      items: z.array(guestItemSchema).min(1, "Your bag is empty").max(100),
    }),
  })
  .strict();

export const guestOrderAccessSchema = z.object({
  guestToken: z
    .string()
    .trim()
    .min(20, "Invalid guest order token")
    .max(80),
});

export const updateOrderStatusSchema = z.object({
  status: z.preprocess(emptyToUndefined, z.nativeEnum(OrderStatus)),
});

export const collectCodPaymentSchema = z.object({
  note: z.string().trim().max(500, "Note is too long").nullable().optional(),
  reference: z.string().trim().max(120, "Reference is too long").nullable().optional(),
});

/** Cash collection covers every order, regardless of payment method. */
export const cashCollectionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(["PENDING", "COLLECTED", "CANCELLED"]).optional(),
  ),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
});

/**
 * Public tracking accepts an order number, receipt number or order id. Only a
 * bounded, PII-free projection of the order is ever returned.
 */
export const orderTrackingQuerySchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, "Enter an order number or code")
    .max(80, "Order code is too long"),
});

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.preprocess(emptyToUndefined, z.nativeEnum(OrderStatus).optional()),
  paymentStatus: z.preprocess(emptyToUndefined, z.nativeEnum(PaymentStatus).optional()),
  paymentMethod: z.preprocess(emptyToUndefined, paymentMethodSchema.optional()),
  userId: z.preprocess(emptyToUndefined, z.string().uuid("Invalid user id").optional()),
  search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  sortOrder: z.preprocess(
    emptyToUndefined,
    z.enum(["asc", "desc"]).default("desc"),
  ),
});
