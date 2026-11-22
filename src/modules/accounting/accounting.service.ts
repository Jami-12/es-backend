import {
  ExpenseCategory,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  Role,
  TransactionType,
  UserStatus,
} from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import {
  dayKey,
  eachDay,
  eachMonth,
  endOfDay,
  endOfMonth,
  endOfYear,
  monthKey,
  normaliseWindow,
  startOfDay,
  startOfMonth,
  startOfYear,
} from "../../utils/dateRange";
import { buildPaginationMeta } from "../../utils/pagination";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  DashboardOverview,
  FinancialReport,
  FinancialSummary,
  PaginatedTransactions,
  PaymentMethodBreakdown,
  ReportPoint,
  TransactionListQuery,
  TransactionResponse,
} from "../../types/accounting.types";
import type { BillFilter } from "../../types/expense.types";
import * as employeeService from "../employee/employee.service";
import * as expenseService from "../expense/expense.service";
import * as inventoryService from "../inventory/inventory.service";

const PAID_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

const paidOrderWhere = (start: Date, end: Date): Prisma.OrderWhereInput => ({
  status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
  payment: {
    is: {
      status: PaymentStatus.PAID,
      paidAt: { gte: start, lte: end },
    },
  },
});

const toNumber = (value: Prisma.Decimal | null | undefined): number =>
  value?.toNumber() ?? 0;

const round = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const getFinancialSummary = async (
  startDate: Date,
  endDate: Date,
): Promise<FinancialSummary> => {
  const { start, end } = normaliseWindow(startDate, endDate);

  const [
    ledgerGroups,
    expenseGroups,
    orderAggregate,
    itemAggregate,
  ] = await Promise.all([
    prisma.financialTransaction.groupBy({
      by: ["transactionType"],
      where: { date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.financialTransaction.groupBy({
      by: ["category"],
      where: {
        transactionType: TransactionType.EXPENSE,
        date: { gte: start, lte: end },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: paidOrderWhere(start, end),
      _sum: {
        totalProductCost: true,
        grossProfit: true,
        totalAmount: true,
        subtotal: true,
        discountAmount: true,
        shippingCost: true,
      },
      _count: { _all: true },
    }),
    prisma.orderItem.aggregate({
      where: {
        order: paidOrderWhere(start, end),
      },
      _sum: { quantity: true },
    }),
  ]);

  const ledgerByType = new Map(
    ledgerGroups.map((group) => [group.transactionType, group]),
  );

  const sales = toNumber(ledgerByType.get(TransactionType.INCOME)?._sum.amount);
  const refunds = toNumber(
    ledgerByType.get(TransactionType.REFUND)?._sum.amount,
  );
  const investments = toNumber(
    ledgerByType.get(TransactionType.INVESTMENT)?._sum.amount,
  );

  const productPurchases = toNumber(
    expenseGroups.find(
      (group) => group.category === ExpenseCategory.PRODUCT_PURCHASE,
    )?._sum.amount,
  );

  const totalExpenses = expenseGroups.reduce(
    (sum, group) => sum + toNumber(group._sum.amount),
    0,
  );
  const operatingExpenses = Math.max(totalExpenses - productPurchases, 0);

  const cogs = toNumber(orderAggregate._sum.totalProductCost);
  const grossProfit = toNumber(orderAggregate._sum.grossProfit);
  // Product revenue and shipping are reported as distinct figures. Shipping is
  // an order-level charge and must never be folded into product sales.
  const productSales = round(
    toNumber(orderAggregate._sum.subtotal) -
      toNumber(orderAggregate._sum.discountAmount),
  );
  const shippingCollected = round(toNumber(orderAggregate._sum.shippingCost));
  const netRevenue = sales - refunds;
  const netProfit = grossProfit - operatingExpenses;
  // Margin compares product-only profit with product-only revenue so shipping
  // cannot distort the percentage.
  const netProfitMargin =
    productSales > 0 ? round((netProfit / productSales) * 100) : 0;

  return {
    currency: env.STORE_CURRENCY,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    revenue: {
      sales: round(sales),
      productSales,
      shipping: shippingCollected,
      refunds: round(refunds),
      net: round(netRevenue),
    },
    cogs: round(cogs),
    grossProfit: round(grossProfit),
    expenses: {
      operating: round(operatingExpenses),
      productPurchases: round(productPurchases),
      total: round(totalExpenses),
    },
    investments: round(investments),
    netProfit: round(netProfit),
    netProfitMargin,
    isProfit: netProfit >= 0,
    orders: {
      paidCount: orderAggregate._count._all,
      itemsSold: itemAggregate._sum.quantity ?? 0,
      // Product-only sales value; shipping is reported in `revenue.shipping`.
      salesValue: productSales,
    },
    expenseBreakdown: expenseGroups
      .map((group) => ({
        category: group.category,
        total: round(toNumber(group._sum.amount)),
        count: group._count._all,
      }))
      .sort((left, right) => right.total - left.total),
  };
};

const buildReportPoint = (period: string): ReportPoint => ({
  period,
  income: 0,
  refunds: 0,
  cogs: 0,
  grossProfit: 0,
  operatingExpenses: 0,
  productPurchases: 0,
  investments: 0,
  netProfit: 0,
});

export const getFinancialReport = async (
  startDate: Date,
  endDate: Date,
  granularity?: "day" | "month",
): Promise<FinancialReport> => {
  const { start, end } = normaliseWindow(startDate, endDate);
  const rangeDays =
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const selectedGranularity =
    granularity ?? (rangeDays <= 62 ? "day" : "month");

  if (selectedGranularity === "day" && rangeDays > 366) {
    throw ApiError.badRequest(
      "Daily reports cannot cover more than 366 days. Use monthly granularity instead.",
    );
  }

  const [summary, transactions, orders] = await Promise.all([
    getFinancialSummary(start, end),
    prisma.financialTransaction.findMany({
      where: { date: { gte: start, lte: end } },
      select: {
        transactionType: true,
        category: true,
        amount: true,
        date: true,
      },
    }),
    prisma.order.findMany({
      where: paidOrderWhere(start, end),
      select: {
        grossProfit: true,
        totalProductCost: true,
        payment: { select: { paidAt: true } },
      },
    }),
  ]);

  const periods =
    selectedGranularity === "day"
      ? eachDay(start, end).map(dayKey)
      : eachMonth(start, end);

  const buckets = new Map<string, ReportPoint>(
    periods.map((period) => [period, buildReportPoint(period)]),
  );

  const getBucket = (period: string): ReportPoint => {
    const existing = buckets.get(period);

    if (existing) {
      return existing;
    }

    const created = buildReportPoint(period);
    buckets.set(period, created);
    return created;
  };

  for (const transaction of transactions) {
    const period =
      selectedGranularity === "day"
        ? dayKey(transaction.date)
        : monthKey(transaction.date);
    const bucket = getBucket(period);
    const amount = transaction.amount.toNumber();

    if (transaction.transactionType === TransactionType.INCOME) {
      bucket.income += amount;
    } else if (transaction.transactionType === TransactionType.REFUND) {
      bucket.refunds += amount;
    } else if (transaction.transactionType === TransactionType.INVESTMENT) {
      bucket.investments += amount;
    } else if (
      transaction.category === ExpenseCategory.PRODUCT_PURCHASE
    ) {
      bucket.productPurchases += amount;
    } else {
      bucket.operatingExpenses += amount;
    }
  }

  for (const order of orders) {
    if (!order.payment?.paidAt) {
      continue;
    }

    const period =
      selectedGranularity === "day"
        ? dayKey(order.payment.paidAt)
        : monthKey(order.payment.paidAt);
    const bucket = getBucket(period);

    bucket.grossProfit += order.grossProfit.toNumber();
    bucket.cogs += order.totalProductCost.toNumber();
  }

  const breakdown = Array.from(buckets.values())
    .sort((left, right) => left.period.localeCompare(right.period))
    .map((bucket) => ({
      ...bucket,
      income: round(bucket.income),
      refunds: round(bucket.refunds),
      cogs: round(bucket.cogs),
      grossProfit: round(bucket.grossProfit),
      operatingExpenses: round(bucket.operatingExpenses),
      productPurchases: round(bucket.productPurchases),
      investments: round(bucket.investments),
      netProfit: round(bucket.grossProfit - bucket.operatingExpenses),
    }));

  return {
    summary,
    granularity: selectedGranularity,
    breakdown,
  };
};

export const getDailyReport = async (date?: Date): Promise<FinancialReport> => {
  const target = date ?? new Date();

  return getFinancialReport(startOfDay(target), endOfDay(target), "day");
};

export const getMonthlyReport = async (
  year: number,
  month: number,
): Promise<FinancialReport> =>
  getFinancialReport(
    startOfMonth(year, month),
    endOfMonth(year, month),
    "day",
  );

export const getYearlyReport = async (
  year: number,
): Promise<FinancialReport> =>
  getFinancialReport(startOfYear(year), endOfYear(year), "month");

export const listTransactions = async (
  query: TransactionListQuery,
): Promise<PaginatedTransactions> => {
  const where: Prisma.FinancialTransactionWhereInput = {};

  if (query.transactionType) {
    where.transactionType = query.transactionType;
  }

  if (query.category) {
    where.category = query.category;
  }

  if (query.startDate || query.endDate) {
    where.date = {
      ...(query.startDate && { gte: startOfDay(query.startDate) }),
      ...(query.endDate && { lte: endOfDay(query.endDate) }),
    };
  }

  if (query.search) {
    where.OR = [
      { description: { contains: query.search, mode: "insensitive" } },
      { category: { contains: query.search, mode: "insensitive" } },
      { referenceId: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [transactions, total] = await prisma.$transaction([
    prisma.financialTransaction.findMany({
      where,
      orderBy: { date: query.sortOrder },
      skip,
      take: query.limit,
    }),
    prisma.financialTransaction.count({ where }),
  ]);

  const items: TransactionResponse[] = transactions.map((transaction) => ({
    id: transaction.id,
    transactionType: transaction.transactionType,
    category: transaction.category,
    amount: transaction.amount.toNumber(),
    date: transaction.date.toISOString(),
    description: transaction.description,
    referenceType: transaction.referenceType,
    referenceId: transaction.referenceId,
    createdById: transaction.createdById,
    createdAt: transaction.createdAt.toISOString(),
  }));

  return {
    items,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getDashboardOverview = async (
  actor: AuthenticatedUser,
): Promise<DashboardOverview> => {
  const now = new Date();
  const monthStart = startOfMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const billFilter: BillFilter = "UNPAID";

  const [
    today,
    thisMonth,
    thisYear,
    inventory,
    employees,
    billResult,
    paymentGroups,
    recentTransactions,
  ] = await Promise.all([
    getFinancialSummary(startOfDay(now), endOfDay(now)),
    getFinancialSummary(monthStart, endOfMonth(now.getUTCFullYear(), now.getUTCMonth() + 1)),
    getFinancialSummary(
      startOfYear(now.getUTCFullYear()),
      endOfYear(now.getUTCFullYear()),
    ),
    inventoryService.getInventoryOverview(),
    employeeService.getEmployeeSummary(),
    expenseService.listBills(actor, { page: 1, limit: 5, filter: billFilter }),
    prisma.payment.groupBy({
      by: ["method"],
      where: {
        status: PaymentStatus.PAID,
        paidAt: { gte: monthStart },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.financialTransaction.findMany({
      orderBy: { date: "desc" },
      take: 10,
    }),
  ]);

  const paymentMethods: PaymentMethodBreakdown[] = paymentGroups.map(
    (group) => ({
      method: group.method,
      total: round(toNumber(group._sum.amount)),
      count: group._count._all,
    }),
  );

  const [
    userTotal,
    userCustomers,
    userAdmins,
    userSuperAdmins,
    activeUsers,
    inactiveUsers,
    blockedUsers,
    deletedUsers,
    newUsersToday,
    newUsersThisMonth,
    productTotal,
    activeProducts,
    inactiveProducts,
    draftProducts,
    outOfStockProducts,
    featuredProducts,
    archivedProducts,
    activeDiscounts,
    scheduledDiscounts,
    expiredDiscounts,
    inactiveDiscounts,
    totalDiscounts,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { role: Role.CUSTOMER, deletedAt: null } }),
    prisma.user.count({ where: { role: Role.ADMIN, deletedAt: null } }),
    prisma.user.count({ where: { role: Role.SUPER_ADMIN, deletedAt: null } }),
    prisma.user.count({
      where: { isActive: true, deletedAt: null },
    }),
    prisma.user.count({
      where: { status: UserStatus.INACTIVE, deletedAt: null },
    }),
    prisma.user.count({
      where: { status: UserStatus.BLOCKED, deletedAt: null },
    }),
    prisma.user.count({ where: { deletedAt: { not: null } } }),
    prisma.user.count({
      where: { createdAt: { gte: startOfDay(now) }, deletedAt: null },
    }),
    prisma.user.count({
      where: { createdAt: { gte: monthStart }, deletedAt: null },
    }),
    prisma.product.count({ where: { archivedAt: null } }),
    prisma.product.count({
      where: { status: ProductStatus.ACTIVE, archivedAt: null },
    }),
    prisma.product.count({
      where: { status: ProductStatus.INACTIVE, archivedAt: null },
    }),
    prisma.product.count({
      where: { status: ProductStatus.DRAFT, archivedAt: null },
    }),
    prisma.product.count({
      where: { status: ProductStatus.OUT_OF_STOCK, archivedAt: null },
    }),
    prisma.product.count({
      where: { isFeatured: true, archivedAt: null },
    }),
    prisma.product.count({ where: { archivedAt: { not: null } } }),
    prisma.productDiscount.count({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    }),
    prisma.productDiscount.count({
      where: { isActive: true, startDate: { gt: now } },
    }),
    prisma.productDiscount.count({
      where: { isActive: true, endDate: { lt: now } },
    }),
    prisma.productDiscount.count({ where: { isActive: false } }),
    prisma.productDiscount.count(),
  ]);

  const management = {
    users: {
      total: userTotal,
      customers: userCustomers,
      admins: userAdmins,
      superAdmins: userSuperAdmins,
      active: activeUsers,
      inactive: inactiveUsers,
      blocked: blockedUsers,
      deleted: deletedUsers,
      newToday: newUsersToday,
      newThisMonth: newUsersThisMonth,
    },
    products: {
      total: productTotal,
      active: activeProducts,
      inactive: inactiveProducts,
      draft: draftProducts,
      outOfStock: outOfStockProducts,
      featured: featuredProducts,
      archived: archivedProducts,
      withActiveDiscount: activeDiscounts,
    },
    discounts: {
      total: totalDiscounts,
      active: activeDiscounts,
      scheduled: scheduledDiscounts,
      expired: expiredDiscounts,
      inactive: inactiveDiscounts,
    },
  };

  const transactions: TransactionResponse[] = recentTransactions.map(
    (transaction) => ({
      id: transaction.id,
      transactionType: transaction.transactionType,
      category: transaction.category,
      amount: transaction.amount.toNumber(),
      date: transaction.date.toISOString(),
      description: transaction.description,
      referenceType: transaction.referenceType,
      referenceId: transaction.referenceId,
      createdById: transaction.createdById,
      createdAt: transaction.createdAt.toISOString(),
    }),
  );

  return {
    currency: env.STORE_CURRENCY,
    generatedAt: now.toISOString(),
    today,
    thisMonth,
    thisYear,
    inventory,
    employees,
    bills: billResult.summary,
    unpaidBills: billResult.items,
    paymentMethods,
    recentTransactions: transactions,
    management,
  };
};

export const getOrderProfitReport = async (
  startDate: Date,
  endDate: Date,
): Promise<{
  summary: FinancialSummary;
  orders: {
    orderId: string;
    orderNumber: string;
    totalAmount: number;
    totalProductCost: number;
    grossProfit: number;
    netProfit: number;
    paidAt: string | null;
  }[];
}> => {
  const { start, end } = normaliseWindow(startDate, endDate);

  const [summary, orders] = await Promise.all([
    getFinancialSummary(start, end),
    prisma.order.findMany({
      where: {
        ...paidOrderWhere(start, end),
        status: { in: PAID_ORDER_STATUSES },
      },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        totalProductCost: true,
        grossProfit: true,
        netProfit: true,
        payment: { select: { paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    summary,
    orders: orders.map((order) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount.toNumber(),
      totalProductCost: order.totalProductCost.toNumber(),
      grossProfit: order.grossProfit.toNumber(),
      netProfit: order.netProfit.toNumber(),
      paidAt: order.payment?.paidAt?.toISOString() ?? null,
    })),
  };
};
