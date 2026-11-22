import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { roundMoney } from "../../utils/money";
import type {
  AnalyticsOverview,
  DailySalesPoint,
  LowStockProduct,
  MonthlySalesPoint,
  OrderAnalytics,
  OrderStatusBreakdown,
  PaymentAnalytics,
  PaymentMethodBreakdown,
  RecentOrderSummary,
  RevenueAnalytics,
} from "../../types/analytics.types";

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

const monthKey = (date: Date): string => date.toISOString().slice(0, 7);

/**
 * Cancelled and returned orders are never collectable. Every revenue figure
 * must exclude them so dashboard revenue cannot count money that was refunded
 * or never collected. Shipping remains included because it is part of the
 * amount actually collected from the customer.
 */
const collectablePaymentWhere = (
  paidAt?: { gte: Date },
): Prisma.PaymentWhereInput => ({
  order: { status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] } },
  ...(paidAt ? { paidAt } : {}),
});

const paidPaymentWhere = (
  paidAt?: { gte: Date },
): Prisma.PaymentWhereInput => ({
  ...collectablePaymentWhere(paidAt),
  status: PaymentStatus.PAID,
});

const buildDailyBuckets = (days: number): Map<string, DailySalesPoint> => {
  const buckets = new Map<string, DailySalesPoint>();
  const today = new Date();

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - index,
      ),
    );
    const key = dayKey(date);
    buckets.set(key, { date: key, revenue: 0, orders: 0 });
  }

  return buckets;
};

const buildMonthlyBuckets = (months: number): Map<string, MonthlySalesPoint> => {
  const buckets = new Map<string, MonthlySalesPoint>();
  const today = new Date();

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - index, 1),
    );
    const key = monthKey(date);
    buckets.set(key, { month: key, revenue: 0, orders: 0 });
  }

  return buckets;
};

const getWindowStart = (days: number): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)),
  );
};

const getMonthWindowStart = (months: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
};

const buildPaymentBreakdown = (
  groups: {
    method: PaymentMethod;
    status: PaymentStatus;
    _count: { _all: number };
    _sum: { amount: { toNumber: () => number } | null };
  }[],
): PaymentMethodBreakdown[] => {
  const breakdownMap = new Map<PaymentMethod, PaymentMethodBreakdown>();

  for (const method of Object.values(PaymentMethod)) {
    breakdownMap.set(method, {
      method,
      totalOrders: 0,
      completedOrders: 0,
      pendingOrders: 0,
      failedOrders: 0,
      revenue: 0,
    });
  }

  for (const group of groups) {
    const entry = breakdownMap.get(group.method);

    if (!entry) {
      continue;
    }

    const count = group._count._all;
    const amount = group._sum.amount?.toNumber() ?? 0;

    entry.totalOrders += count;

    if (group.status === PaymentStatus.PAID) {
      entry.completedOrders += count;
      entry.revenue += amount;
    } else if (
      group.status === PaymentStatus.PENDING ||
      group.status === PaymentStatus.PROCESSING
    ) {
      entry.pendingOrders += count;
    } else if (group.status === PaymentStatus.FAILED) {
      entry.failedOrders += count;
    }
  }

  return Array.from(breakdownMap.values()).map((entry) => ({
    ...entry,
    revenue: roundMoney(entry.revenue),
  }));
};

const buildRecentOrders = async (take: number): Promise<RecentOrderSummary[]> => {
  const orders = await prisma.order.findMany({
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      status: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      payment: { select: { method: true, status: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount.toNumber(),
    status: order.status,
    paymentMethod: order.payment?.method ?? null,
    paymentStatus: order.payment?.status ?? null,
    customerName: order.user.name,
    customerEmail: order.user.email,
    createdAt: order.createdAt.toISOString(),
  }));
};

const buildLowStockProducts = async (): Promise<LowStockProduct[]> => {
  const lowStockIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM products
    WHERE stock <= "minimumStockLevel" AND status::text <> 'INACTIVE'
  `;

  const products = await prisma.product.findMany({
    where: { id: { in: lowStockIds.map((row) => row.id) } },
    select: {
      id: true,
      title: true,
      sku: true,
      stock: true,
      status: true,
    },
    orderBy: { stock: "asc" },
    take: 20,
  });

  return products;
};

const buildOrderStatusBreakdown = (
  groups: { status: OrderStatus; _count: { _all: number } }[],
): OrderStatusBreakdown[] => {
  const counts = new Map<OrderStatus, number>();

  for (const status of Object.values(OrderStatus)) {
    counts.set(status, 0);
  }

  for (const group of groups) {
    counts.set(group.status, group._count._all);
  }

  return Array.from(counts.entries()).map(([status, count]) => ({
    status,
    count,
  }));
};

export const getAnalyticsOverview = async (): Promise<AnalyticsOverview> => {
  const dailyStart = getWindowStart(30);
  const monthlyStart = getMonthWindowStart(12);

  const [
    revenueAggregate,
    completedPaymentsDaily,
    completedPaymentsMonthly,
    totalOrders,
    orderStatusGroups,
    roleGroups,
    totalProducts,
    activeUsers,
    inactiveUsers,
    activeProducts,
    productsWithActiveDiscounts,
    paymentGroups,
    recentOrders,
    lowStockProducts,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: paidPaymentWhere(),
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: paidPaymentWhere({ gte: dailyStart }),
      select: { amount: true, paidAt: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: paidPaymentWhere({ gte: monthlyStart }),
      select: { amount: true, paidAt: true, createdAt: true },
    }),
    prisma.order.count(),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["role"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.product.count({ where: { archivedAt: null } }),
    prisma.user.count({
      where: { isActive: true, deletedAt: null },
    }),
    prisma.user.count({
      where: { isActive: false, deletedAt: null },
    }),
    prisma.product.count({
      where: { status: ProductStatus.ACTIVE, archivedAt: null },
    }),
    prisma.productDiscount.count({
      where: {
        isActive: true,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
    }),
    prisma.payment.groupBy({
      where: collectablePaymentWhere(),
      by: ["method", "status"],
      _count: { _all: true },
      _sum: { amount: true },
    }),
    buildRecentOrders(5),
    buildLowStockProducts(),
  ]);

  const dailyBuckets = buildDailyBuckets(30);
  const monthlyBuckets = buildMonthlyBuckets(12);

  for (const payment of completedPaymentsDaily) {
    const key = dayKey(payment.paidAt ?? payment.createdAt);
    const bucket = dailyBuckets.get(key);

    if (bucket) {
      bucket.revenue = roundMoney(bucket.revenue + payment.amount.toNumber());
      bucket.orders += 1;
    }
  }

  for (const payment of completedPaymentsMonthly) {
    const key = monthKey(payment.paidAt ?? payment.createdAt);
    const bucket = monthlyBuckets.get(key);

    if (bucket) {
      bucket.revenue = roundMoney(bucket.revenue + payment.amount.toNumber());
      bucket.orders += 1;
    }
  }

  const roleCounts = new Map<Role, number>();

  for (const group of roleGroups) {
    roleCounts.set(group.role, group._count._all);
  }

  const totalRevenue = revenueAggregate._sum.amount?.toNumber() ?? 0;
  const completedCount = revenueAggregate._count._all;

  return {
    generatedAt: new Date().toISOString(),
    currency: env.STORE_CURRENCY,
    revenue: {
      total: roundMoney(totalRevenue),
      averageOrderValue:
        completedCount > 0 ? roundMoney(totalRevenue / completedCount) : 0,
    },
    totals: {
      orders: totalOrders,
      customers: roleCounts.get(Role.CUSTOMER) ?? 0,
      admins: roleCounts.get(Role.ADMIN) ?? 0,
      superAdmins: roleCounts.get(Role.SUPER_ADMIN) ?? 0,
      activeUsers,
      inactiveUsers,
      products: totalProducts,
      activeProducts,
      productsWithActiveDiscounts,
    },
    dailySales: Array.from(dailyBuckets.values()),
    monthlySales: Array.from(monthlyBuckets.values()),
    paymentMethodBreakdown: buildPaymentBreakdown(paymentGroups),
    orderStatusBreakdown: buildOrderStatusBreakdown(orderStatusGroups),
    recentOrders,
    lowStockProducts,
  };
};

export const getRevenueAnalytics = async (): Promise<RevenueAnalytics> => {
  const dailyStart = getWindowStart(30);
  const monthlyStart = getMonthWindowStart(12);

  const [aggregate, dailyPayments, monthlyPayments] = await Promise.all([
    prisma.payment.aggregate({
      where: paidPaymentWhere(),
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: paidPaymentWhere({ gte: dailyStart }),
      select: { amount: true, paidAt: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: paidPaymentWhere({ gte: monthlyStart }),
      select: { amount: true, paidAt: true, createdAt: true },
    }),
  ]);

  const dailyBuckets = buildDailyBuckets(30);
  const monthlyBuckets = buildMonthlyBuckets(12);

  for (const payment of dailyPayments) {
    const bucket = dailyBuckets.get(dayKey(payment.paidAt ?? payment.createdAt));
    if (bucket) {
      bucket.revenue = roundMoney(bucket.revenue + payment.amount.toNumber());
      bucket.orders += 1;
    }
  }

  for (const payment of monthlyPayments) {
    const bucket = monthlyBuckets.get(
      monthKey(payment.paidAt ?? payment.createdAt),
    );
    if (bucket) {
      bucket.revenue = roundMoney(bucket.revenue + payment.amount.toNumber());
      bucket.orders += 1;
    }
  }

  const totalRevenue = aggregate._sum.amount?.toNumber() ?? 0;

  return {
    currency: env.STORE_CURRENCY,
    totalRevenue: roundMoney(totalRevenue),
    averageOrderValue:
      aggregate._count._all > 0
        ? roundMoney(totalRevenue / aggregate._count._all)
        : 0,
    completedPaymentCount: aggregate._count._all,
    daily: Array.from(dailyBuckets.values()),
    monthly: Array.from(monthlyBuckets.values()),
  };
};

export const getPaymentAnalytics = async (): Promise<PaymentAnalytics> => {
  const [methodGroups, statusGroups, aggregate] = await Promise.all([
    prisma.payment.groupBy({
      where: collectablePaymentWhere(),
      by: ["method", "status"],
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      where: collectablePaymentWhere(),
      by: ["status"],
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: paidPaymentWhere(),
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  return {
    currency: env.STORE_CURRENCY,
    totalRevenue: roundMoney(aggregate._sum.amount?.toNumber() ?? 0),
    totalPayments: statusGroups.reduce(
      (sum, group) => sum + group._count._all,
      0,
    ),
    byMethod: buildPaymentBreakdown(methodGroups),
    byStatus: statusGroups.map((group) => ({
      status: group.status,
      count: group._count._all,
      amount: roundMoney(group._sum.amount?.toNumber() ?? 0),
    })),
  };
};

export const getOrderAnalytics = async (): Promise<OrderAnalytics> => {
  const dailyStart = getWindowStart(30);

  const [totalOrders, statusGroups, recentOrders, orders] = await Promise.all([
    prisma.order.count(),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    buildRecentOrders(10),
    prisma.order.findMany({
      where: { createdAt: { gte: dailyStart } },
      select: { createdAt: true },
    }),
  ]);

  const dailyMap = new Map<string, number>();

  for (let index = 29; index >= 0; index -= 1) {
    const date = new Date();
    const key = dayKey(
      new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate() - index,
        ),
      ),
    );
    dailyMap.set(key, 0);
  }

  for (const order of orders) {
    const key = dayKey(order.createdAt);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
  }

  return {
    totalOrders,
    byStatus: buildOrderStatusBreakdown(statusGroups),
    daily: Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      orders: count,
    })),
    recentOrders,
  };
};
