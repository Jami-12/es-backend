import { ExpenseCategory, ExpenseStatus } from "@prisma/client";
import { z } from "zod";

import { booleanishSchema } from "./helpers";

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

export const createExpenseSchema = z.object({
  category: z.nativeEnum(ExpenseCategory),
  amount: amountSchema,
  description: z.string().trim().max(2000).nullish(),
  expenseDate: dateStringSchema.nullish(),
  dueDate: dateStringSchema.nullish(),
  isPaid: booleanishSchema.optional(),
  receiptUrl: z.string().trim().max(2000).nullish(),
  status: z.nativeEnum(ExpenseStatus).optional(),
});

export const updateExpenseSchema = z
  .object({
    category: z.nativeEnum(ExpenseCategory).optional(),
    amount: amountSchema.optional(),
    description: z.string().trim().max(2000).nullish(),
    expenseDate: dateStringSchema.nullish(),
    dueDate: dateStringSchema.nullish(),
    isPaid: booleanishSchema.optional(),
    receiptUrl: z.string().trim().max(2000).nullish(),
    status: z.nativeEnum(ExpenseStatus).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const expenseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.nativeEnum(ExpenseCategory).optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  isPaid: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().trim().max(200).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const billListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  filter: z.enum(["ALL", "PAID", "UNPAID", "UPCOMING", "OVERDUE"]).default("ALL"),
});
