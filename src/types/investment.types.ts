import type { PaginatedResult } from "./common.types";

export interface CreateInvestmentInput {
  amount: number;
  source: string;
  description?: string;
  investmentDate?: string;
}

export interface UpdateInvestmentInput {
  amount?: number;
  source?: string;
  description?: string | null;
  investmentDate?: string;
}

export interface InvestmentListQuery {
  page: number;
  limit: number;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  sortOrder: "asc" | "desc";
}

export interface InvestmentResponse {
  id: string;
  amount: number;
  source: string;
  description: string | null;
  investmentDate: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentSummary {
  currency: string;
  total: number;
  count: number;
  thisMonth: number;
  thisYear: number;
}

export type PaginatedInvestments = PaginatedResult<InvestmentResponse>;
