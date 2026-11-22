import { OrderStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { buildPaginationMeta } from "../../utils/pagination";
import type {
  CustomerListQuery,
  CustomerSummary,
  PaginatedCustomers,
} from "../../types/user.types";

/**
 * Admin-scoped customer directory.
 *
 * Deliberately read-only and limited to non-privileged fields: this endpoint
 * never exposes roles, password state or account-access controls. Those remain
 * exclusive to the super-admin `/users` routes.
 */
export const listCustomers = async (
  query: CustomerListQuery,
): Promise<PaginatedCustomers> => {
  const where: Prisma.UserWhereInput = {
    role: Role.CUSTOMER,
    deletedAt: null,
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [customers, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: query.sortOrder },
      skip,
      take: query.limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        isActive: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const ids = customers.map((customer) => customer.id);

  const [spendRows, paidOrderRows, lastOrderRows] =
    ids.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.order.groupBy({
            by: ["userId"],
            where: {
              userId: { in: ids },
              paymentStatus: "PAID",
              status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
            },
            _sum: { totalAmount: true },
          }),
          prisma.order.groupBy({
            by: ["userId"],
            where: {
              userId: { in: ids },
              paymentStatus: "PAID",
              status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
            },
            _count: { _all: true },
          }),
          prisma.order.groupBy({
            by: ["userId"],
            where: { userId: { in: ids } },
            _max: { createdAt: true },
          }),
        ]);

  const spendByUser = new Map(
    spendRows.map((row) => [
      row.userId,
      row._sum.totalAmount?.toNumber() ?? 0,
    ]),
  );
  const paidCountByUser = new Map(
    paidOrderRows.map((row) => [row.userId, row._count._all]),
  );
  const lastOrderByUser = new Map(
    lastOrderRows.map((row) => [
      row.userId,
      row._max.createdAt?.toISOString() ?? null,
    ]),
  );

  const items: CustomerSummary[] = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    status: customer.status,
    isActive: customer.isActive,
    orderCount: customer._count.orders,
    paidOrderCount: paidCountByUser.get(customer.id) ?? 0,
    totalSpent: spendByUser.get(customer.id) ?? 0,
    lastOrderAt: lastOrderByUser.get(customer.id) ?? null,
    createdAt: customer.createdAt.toISOString(),
  }));

  return {
    items,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};
