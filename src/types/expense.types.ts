import type {
  ExpenseCategory,
  ExpenseStatus,
} from "@prisma/client";
import type { PaginatedResult } from "./common.types";

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amount: number;
  description?: string;
  expenseDate?: string;
  dueDate?: string;
  isPaid?: boolean;
  receiptUrl?: string;
  status?: ExpenseStatus;
}

export interface UpdateExpenseInput {
  category?: ExpenseCategory;
  amount?: number;
  description?: string | null;
  expenseDate?: string;
  dueDate?: string | null;
  isPaid?: boolean;
  receiptUrl?: string | null;
  status?: ExpenseStatus;
}

export interface ExpenseListQuery {
  page: number;
  limit: number;
  category?: ExpenseCategory;
  status?: ExpenseStatus;
  isPaid?: boolean;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  sortOrder: "asc" | "desc";
}

export type BillFilter = "ALL" | "PAID" | "UNPAID" | "UPCOMING" | "OVERDUE";

export interface BillListQuery {
  page: number;
  limit: number;
  filter: BillFilter;
}

export interface ExpenseResponse {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  expenseDate: string;
  dueDate: string | null;
  isPaid: boolean;
  paidAt: string | null;
  receiptUrl: string | null;
  status: ExpenseStatus;
  createdById: string;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategoryTotal {
  category: ExpenseCategory;
  total: number;
  count: number;
}

export interface ExpenseSummary {
  currency: string;
  total: number;
  count: number;
  paid: number;
  unpaid: number;
  byCategory: ExpenseCategoryTotal[];
}

export interface BillSummary {
  currency: string;
  unpaidTotal: number;
  unpaidCount: number;
  overdueTotal: number;
  overdueCount: number;
  upcomingTotal: number;
  upcomingCount: number;
  paidThisMonthTotal: number;
}

export type PaginatedExpenses = PaginatedResult<ExpenseResponse>;
