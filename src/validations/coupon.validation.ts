import { z } from "zod";

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

const couponPayloadSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Coupon code must contain at least 2 characters")
    .max(50, "Coupon code must contain at most 50 characters")
    .regex(/^[A-Za-z0-9_-]+$/, "Coupon code may only contain letters, numbers, dashes and underscores")
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(2000).optional(),
  discountPercent: percentSchema.optional(),
  discountAmount: positiveMoneySchema.optional(),
  minimumAmount: moneySchema.optional(),
  maxDiscount: positiveMoneySchema.optional(),
  usageLimit: z.coerce.number().int().min(1).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
});

export const createCouponSchema = couponPayloadSchema
  .superRefine((value, ctx) => {
    if (
      (value.discountPercent === undefined) ===
      (value.discountAmount === undefined)
    ) {
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
  });

export const updateCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[A-Za-z0-9_-]+$/, "Coupon code may only contain letters, numbers, dashes and underscores")
      .transform((value) => value.toUpperCase())
      .optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    discountPercent: percentSchema.nullable().optional(),
    discountAmount: positiveMoneySchema.nullable().optional(),
    minimumAmount: moneySchema.nullable().optional(),
    maxDiscount: positiveMoneySchema.nullable().optional(),
    usageLimit: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
    isActive: z.boolean().optional(),
    startDate: dateSchema.nullable().optional(),
    endDate: dateSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const couponListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const validateCouponSchema = z.object({
  code: z.string().trim().min(1, "Coupon code is required").max(50),
});
