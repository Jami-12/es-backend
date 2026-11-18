import { SalaryStatus } from "@prisma/client";
import { z } from "zod";

import { emptyToUndefined } from "./helpers";

const amountSchema = z.coerce
  .number()
  .finite("Amount must be a valid number")
  .positive("Amount must be greater than zero")
  .max(99_999_999.99, "Amount is too large");

const adjustmentSchema = z.coerce
  .number()
  .finite("Amount must be a valid number")
  .min(0, "Amount cannot be negative")
  .max(99_999_999.99, "Amount is too large");

const dateStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const optionalValue = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

export const createSalaryPaymentSchema = z.object({
  employeeId: z.string().uuid("Invalid employee id"),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  amount: optionalValue(amountSchema),
  bonus: optionalValue(adjustmentSchema),
  deduction: optionalValue(adjustmentSchema),
  paymentDate: optionalValue(dateStringSchema),
  notes: z.string().trim().max(2000).nullish(),
  status: z.nativeEnum(SalaryStatus).optional(),
});

export const salaryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: z.string().uuid("Invalid employee id").optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.nativeEnum(SalaryStatus).optional(),
  search: z.string().trim().max(200).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const paySalarySchema = z
  .object({
    paymentDate: dateStringSchema.optional(),
  })
  .optional();

export const salarySummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});
