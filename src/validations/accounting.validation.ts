import { TransactionType } from "@prisma/client";
import { z } from "zod";

export const dateRangeQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const dailyReportQuerySchema = z.object({
  date: z.coerce.date().optional(),
});

export const monthlyReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const yearlyReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const reportQuerySchema = dateRangeQuerySchema.extend({
  granularity: z.enum(["day", "month"]).optional(),
});

export const transactionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  transactionType: z.nativeEnum(TransactionType).optional(),
  category: z.string().trim().max(80).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().trim().max(200).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
