import type { SalaryStatus } from "@prisma/client";
import type { PaginatedResult } from "./common.types";

export interface CreateSalaryPaymentInput {
  employeeId: string;
  month: number;
  year: number;
  amount?: number;
  bonus?: number;
  deduction?: number;
  paymentDate?: string;
  notes?: string;
  status?: SalaryStatus;
}

export interface SalaryListQuery {
  page: number;
  limit: number;
  employeeId?: string;
  month?: number;
  year?: number;
  status?: SalaryStatus;
  search?: string;
  sortOrder: "asc" | "desc";
}

export interface SalaryEmployeeSummary {
  id: string;
  name: string;
  position: string;
  department: string | null;
}

export interface SalaryPaymentResponse {
  id: string;
  employeeId: string;
  employee: SalaryEmployeeSummary;
  month: number;
  year: number;
  amount: number;
  bonus: number;
  deduction: number;
  finalAmount: number;
  status: SalaryStatus;
  paymentDate: string | null;
  notes: string | null;
  expenseId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalarySummary {
  currency: string;
  totalPaid: number;
  totalPending: number;
  paidCount: number;
  pendingCount: number;
  byMonth: { year: number; month: number; total: number }[];
}

export type PaginatedSalaryPayments = PaginatedResult<SalaryPaymentResponse>;
