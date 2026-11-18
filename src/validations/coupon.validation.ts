import { z } from "zod";

import { booleanishSchema, emptyToUndefined, optionalInputSchema } from "./helpers";

const moneySchema = z.coerce
  .number()
  .finite("Amount must be a valid number")
  .min(0, "Amount cannot be negative")
  .max(99_999_999.99, "Amount is too large");

const percentSchema = z.coerce
  .number()
  .finite("Discount percent must be a valid number")
  .min(0.01, "Discount percent must be greater than zero")
  .max(100, "Discount percent cannot exceed 100");

const positiveMoneySchema = moneySchema.refine(
  (value) => value > 0,
  "Amount must be greater than zero",
);

const dateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const optionalPercentSchema = optionalInputSchema(percentSchema);
const optionalMoneySchema = optionalInputSchema(moneySchema);
const optionalPositiveMoneySchema = optionalInputSchema(positiveMoneySchema);
const optionalDateSchema = optionalInputSchema(dateSchema);
const optionalUsageLimitSchema = optionalInputSchema(
  z.coerce.number().int().min(1).max(1_000_000),
);

const hasValue = (value: number | null | undefined): value is number =>
  value !== undefined && value !== null;

const couponPayloadSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Coupon code must contain at least 2 characters")
    .max(50, "Coupon code must contain at most 50 characters")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Coupon code may only contain letters, numbers, dashes and underscores",
    )
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(2000).nullish(),
  discountPercent: optionalPercentSchema,
  discountAmount: optionalPositiveMoneySchema,
  minimumAmount: optionalMoneySchema,
  maxDiscount: optionalPositiveMoneySchema,
  usageLimit: optionalUsageLimitSchema,
  isActive: booleanishSchema.optional(),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
});

export const createCouponSchema = couponPayloadSchema.superRefine(
  (value, ctx) => {
    if (hasValue(value.discountPercent) === hasValue(value.discountAmount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountPercent"],
        message: "Provide exactly one of discountPercent or discountAmount",
      });
    }

    if (
      value.startDate &&
      value.endDate &&
      Date.parse(value.endDate) <= Date.parse(value.startDate)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be after start date",
      });
    }
  },
);

export const updateCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Coupon code may only contain letters, numbers, dashes and underscores",
      )
      .transform((value) => value.toUpperCase())
      .optional(),
    description: z.string().trim().max(2000).nullish(),
    discountPercent: optionalPercentSchema,
    discountAmount: optionalPositiveMoneySchema,
    minimumAmount: optionalMoneySchema,
    maxDiscount: optionalPositiveMoneySchema,
    usageLimit: optionalUsageLimitSchema,
    isActive: booleanishSchema.optional(),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateCouponStatusSchema = z.object({
  isActive: booleanishSchema,
});

export const couponListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const normalizeCouponValidationInput = (raw: unknown): unknown => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const value = { ...(raw as Record<string, unknown>) };

  if (value.subtotal === undefined) {
    value.subtotal =
      value.orderAmount ?? value.amount ?? value.cartTotal ?? value.total;
  }

  return value;
};

export const validateCouponSchema = z.preprocess(
  normalizeCouponValidationInput,
  z.object({
    code: z.string().trim().min(1, "Coupon code is required").max(50),
    subtotal: z.preprocess(emptyToUndefined, moneySchema.optional()),
  }),
);
