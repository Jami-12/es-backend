import { z } from "zod";

const amountSchema = z.coerce
  .number()
  .finite("Amount must be a valid number")
  .positive("Amount must be greater than zero")
  .max(99_999_999.99, "Amount is too large");

const dateStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const createInvestmentSchema = z.object({
  amount: amountSchema,
  source: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullish(),
  investmentDate: dateStringSchema.nullish(),
});

export const updateInvestmentSchema = z
  .object({
    amount: amountSchema.optional(),
    source: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullish(),
    investmentDate: dateStringSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const investmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().trim().max(200).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
