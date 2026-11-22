import type {
  PaymentMethod,
  TransactionType,
} from "@prisma/client";
import type { BillSummary, ExpenseResponse } from "./expense.types";
import type { EmployeeSummary } from "./employee.types";
import type { InventoryOverview } from "./inventory.types";
import type { PaginatedResult } from "./common.types";

export interface AccountingPeriod {
  start: string;
  end: string;
}

export interface FinancialSummary {
  currency: string;
  period: AccountingPeriod;
  revenue: {
    /** Cash collected from ledger income entries, including shipping. */
    sales: number;
    /** Product sales only (product subtotal minus discounts); excludes shipping. */
    productSales: number;
    /** Shipping charged separately; never part of product revenue. */
    shipping: number;
    refunds: number;
    net: number;
  };
  cogs: number;
  grossProfit: number;
  expenses: {
    operating: number;
    productPurchases: number;
    total: number;
  };
  investments: number;
  netProfit: number;
  netProfitMargin: number;
  isProfit: boolean;
  orders: {
    paidCount: number;
    itemsSold: number;
    salesValue: number;
  };
  expenseBreakdown: { category: string; total: number; count: number }[];
}

export interface ReportPoint {
  period: string;
  income: number;
  refunds: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  productPurchases: number;
  investments: number;
  netProfit: number;
}

export interface FinancialReport {
  summary: FinancialSummary;
  granularity: "day" | "month";
  breakdown: ReportPoint[];
}

export interface TransactionListQuery {
  page: number;
  limit: number;
  transactionType?: TransactionType;
  category?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  sortOrder: "asc" | "desc";
}

export interface TransactionResponse {
  id: string;
  transactionType: TransactionType;
  category: string;
  amount: number;
  date: string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface PaymentMethodBreakdown {
  method: PaymentMethod;
  total: number;
  count: number;
}

export interface UserStats {
  total: number;
  customers: number;
  admins: number;
  superAdmins: number;
  active: number;
  inactive: number;
  blocked: number;
  deleted: number;
  newToday: number;
  newThisMonth: number;
}

export interface ProductStats {
  total: number;
  active: number;
  inactive: number;
  draft: number;
  outOfStock: number;
  featured: number;
  archived: number;
  withActiveDiscount: number;
}

export interface DiscountStats {
  total: number;
  active: number;
  scheduled: number;
  expired: number;
  inactive: number;
}

export interface ManagementStats {
  users: UserStats;
  products: ProductStats;
  discounts: DiscountStats;
}

export interface DashboardOverview {
  currency: string;
  generatedAt: string;
  today: FinancialSummary;
  thisMonth: FinancialSummary;
  thisYear: FinancialSummary;
  inventory: InventoryOverview;
  employees: EmployeeSummary;
  bills: BillSummary;
  unpaidBills: ExpenseResponse[];
  paymentMethods: PaymentMethodBreakdown[];
  recentTransactions: TransactionResponse[];
  management: ManagementStats;
}

export interface DateRangeQuery {
  startDate: Date;
  endDate: Date;
}

export type PaginatedTransactions = PaginatedResult<TransactionResponse>;
