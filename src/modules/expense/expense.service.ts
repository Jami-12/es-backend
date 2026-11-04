import {
  ExpenseCategory,
  ExpenseStatus,
  Prisma,
  Role,
  TransactionType,
} from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { endOfDay, startOfDay } from "../../utils/dateRange";
import { deleteLedgerEntry, upsertLedgerEntry } from "../../utils/ledger";
import { buildPaginationMeta } from "../../utils/pagination";
import { toDecimal } from "../../utils/money";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  BillListQuery,
  BillSummary,
  CreateExpenseInput,
  ExpenseResponse,
  ExpenseSummary,
  PaginatedExpenses,
  UpdateExpenseInput,
  ExpenseListQuery,
} from "../../types/expense.types";

const ADMIN_ALLOWED_CATEGORIES: ExpenseCategory[] = [
  ExpenseCategory.ELECTRICITY_BILL,
  ExpenseCategory.INTERNET_BILL,
  ExpenseCategory.WATER_BILL,
  ExpenseCategory.GAS_BILL,
  ExpenseCategory.TRANSPORT,
  ExpenseCategory.DELIVERY,
  ExpenseCategory.MARKETING,
  ExpenseCategory.ADVERTISING,
  ExpenseCategory.MAINTENANCE,
  ExpenseCategory.OFFICE_SUPPLIES,
  ExpenseCategory.OTHER,
];

const expenseSelect = {
  id: true,
  category: true,
  amount: true,
  description: true,
  expenseDate: true,
  dueDate: true,
  isPaid: true,
  paidAt: true,
  receiptUrl: true,
  status: true,
  createdById: true,
  approvedById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExpenseSelect;

type ExpenseRecord = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;
type TxClient = Prisma.TransactionClient;

const toExpenseResponse = (expense: ExpenseRecord): ExpenseResponse => ({
  id: expense.id,
  category: expense.category,
  amount: expense.amount.toNumber(),
  description: expense.description,
  expenseDate: expense.expenseDate.toISOString(),
  dueDate: expense.dueDate?.toISOString() ?? null,
  isPaid: expense.isPaid,
  paidAt: expense.paidAt?.toISOString() ?? null,
  receiptUrl: expense.receiptUrl,
  status: expense.status,
  createdById: expense.createdById,
  approvedById: expense.approvedById,
  createdAt: expense.createdAt.toISOString(),
  updatedAt: expense.updatedAt.toISOString(),
});

const assertAdminCategory = (
  actor: AuthenticatedUser,
  category: ExpenseCategory,
): void => {
  if (
    actor.role === Role.ADMIN &&
    !ADMIN_ALLOWED_CATEGORIES.includes(category)
  ) {
    throw ApiError.forbidden(
      `ADMIN role cannot manage ${category} expenses. Ask a SUPER_ADMIN.`,
    );
  }
};

const syncExpenseLedger = async (
  expense: ExpenseRecord,
  client: TxClient,
): Promise<void> => {
  if (expense.status !== ExpenseStatus.APPROVED) {
    await deleteLedgerEntry("EXPENSE", expense.id, undefined, client);
    return;
  }

  await upsertLedgerEntry(
    {
      transactionType: TransactionType.EXPENSE,
      category: expense.category,
      amount: expense.amount,
      date: expense.expenseDate,
      description:
        expense.description ?? `Expense recorded for ${expense.category}`,
      referenceType: "EXPENSE",
      referenceId: expense.id,
      createdById: expense.createdById,
      metadata: {
        isPaid: expense.isPaid,
        dueDate: expense.dueDate?.toISOString() ?? null,
      },
    },
    client,
  );
};

export const createExpense = async (
  actor: AuthenticatedUser,
  input: CreateExpenseInput,
  ipAddress?: string,
): Promise<ExpenseResponse> => {
  assertAdminCategory(actor, input.category);

  const expenseDate = input.expenseDate
    ? new Date(input.expenseDate)
    : new Date();
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const isPaid = input.isPaid ?? !dueDate;
  const status =
    actor.role === Role.SUPER_ADMIN
      ? input.status ?? ExpenseStatus.APPROVED
      : ExpenseStatus.PENDING;

  if (actor.role === Role.ADMIN && input.status === ExpenseStatus.APPROVED) {
    throw ApiError.forbidden(
      "ADMIN role cannot self-approve expenses. A SUPER_ADMIN must approve them.",
    );
  }

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        category: input.category,
        amount: toDecimal(input.amount),
        description: input.description?.trim() || null,
        expenseDate,
        dueDate,
        isPaid,
        paidAt: isPaid ? expenseDate : null,
        receiptUrl: input.receiptUrl?.trim() || null,
        status,
        createdById: actor.id,
        approvedById:
          actor.role === Role.SUPER_ADMIN && status === ExpenseStatus.APPROVED
            ? actor.id
            : null,
      },
      select: expenseSelect,
    });

    await syncExpenseLedger(created, tx);

    return created;
  });

  await recordAudit({
    userId: actor.id,
    action: "CREATE_EXPENSE",
    entity: "Expense",
    entityId: expense.id,
    description: `Created ${expense.category} expense of ${expense.amount.toFixed(2)}`,
    newData: expense,
    ipAddress,
  });

  return toExpenseResponse(expense);
};

export const getExpenseById = async (
  actor: AuthenticatedUser,
  expenseId: string,
): Promise<ExpenseResponse> => {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: expenseSelect,
  });

  if (!expense) {
    throw ApiError.notFound("Expense not found");
  }

  if (actor.role === Role.ADMIN && expense.createdById !== actor.id) {
    throw ApiError.notFound("Expense not found");
  }

  return toExpenseResponse(expense);
};

export const listExpenses = async (
  actor: AuthenticatedUser,
  query: ExpenseListQuery,
): Promise<PaginatedExpenses> => {
  const where: Prisma.ExpenseWhereInput = {};

  if (actor.role === Role.ADMIN) {
    where.createdById = actor.id;
    where.category = { in: ADMIN_ALLOWED_CATEGORIES };
  }

  if (query.category) {
    where.category = query.category;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (typeof query.isPaid === "boolean") {
    where.isPaid = query.isPaid;
  }

  if (query.startDate || query.endDate) {
    where.expenseDate = {
      ...(query.startDate && { gte: startOfDay(query.startDate) }),
      ...(query.endDate && { lte: endOfDay(query.endDate) }),
    };
  }

  if (query.search) {
    where.description = { contains: query.search, mode: "insensitive" };
  }

  const skip = (query.page - 1) * query.limit;

  const [expenses, total] = await prisma.$transaction([
    prisma.expense.findMany({
      where,
      select: expenseSelect,
      orderBy: { expenseDate: query.sortOrder },
      skip,
      take: query.limit,
    }),
    prisma.expense.count({ where }),
  ]);

  return {
    items: expenses.map(toExpenseResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const updateExpense = async (
  actor: AuthenticatedUser,
  expenseId: string,
  input: UpdateExpenseInput,
  ipAddress?: string,
): Promise<ExpenseResponse> => {
  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { ...expenseSelect, salaryPayment: { select: { id: true } } },
  });

  if (!existing) {
    throw ApiError.notFound("Expense not found");
  }

  if (existing.salaryPayment) {
    throw ApiError.conflict(
      "This expense is linked to a salary payment. Use the salary endpoints to manage it.",
    );
  }

  if (input.category) {
    assertAdminCategory(actor, input.category);
  }

  if (actor.role === Role.ADMIN) {
    if (existing.createdById !== actor.id) {
      throw ApiError.forbidden("You can only update expenses you created");
    }

    if (existing.status !== ExpenseStatus.PENDING) {
      throw ApiError.forbidden(
        "Only PENDING expenses can be changed by an ADMIN",
      );
    }

    if (
      input.status &&
      input.status !== ExpenseStatus.PENDING &&
      input.status !== ExpenseStatus.CANCELLED
    ) {
      throw ApiError.forbidden(
        "ADMIN role cannot approve expenses. A SUPER_ADMIN must approve them.",
      );
    }
  }

  const data: Prisma.ExpenseUncheckedUpdateInput = {};

  if (input.category !== undefined) {
    data.category = input.category;
  }

  if (input.amount !== undefined) {
    data.amount = toDecimal(input.amount);
  }

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (input.expenseDate !== undefined) {
    data.expenseDate = new Date(input.expenseDate);
  }

  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }

  if (input.receiptUrl !== undefined) {
    data.receiptUrl = input.receiptUrl?.trim() || null;
  }

  if (input.isPaid !== undefined) {
    data.isPaid = input.isPaid;
    data.paidAt = input.isPaid
      ? existing.paidAt ?? new Date()
      : null;
  }

  if (input.status !== undefined) {
    data.status = input.status;

    if (
      input.status === ExpenseStatus.APPROVED &&
      actor.role === Role.SUPER_ADMIN
    ) {
      data.approvedById = actor.id;
    }

    if (input.status === ExpenseStatus.CANCELLED) {
      data.isPaid = false;
      data.paidAt = null;
    }
  }

  const expense = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({
      where: { id: expenseId },
      data,
      select: expenseSelect,
    });

    await syncExpenseLedger(updated, tx);

    return updated;
  });

  await recordAudit({
    userId: actor.id,
    action: "UPDATE_EXPENSE",
    entity: "Expense",
    entityId: expense.id,
    description: `Updated ${expense.category} expense ${expense.id}`,
    oldData: existing,
    newData: expense,
    ipAddress,
  });

  return toExpenseResponse(expense);
};

export const cancelExpense = async (
  actor: AuthenticatedUser,
  expenseId: string,
  ipAddress?: string,
): Promise<ExpenseResponse> => {
  const existing = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { ...expenseSelect, salaryPayment: { select: { id: true } } },
  });

  if (!existing) {
    throw ApiError.notFound("Expense not found");
  }

  if (existing.salaryPayment) {
    throw ApiError.conflict(
      "This expense is linked to a salary payment. Cancel the salary payment instead.",
    );
  }

  if (actor.role === Role.ADMIN) {
    if (
      existing.createdById !== actor.id ||
      existing.status !== ExpenseStatus.PENDING
    ) {
      throw ApiError.forbidden(
        "ADMIN role can only cancel their own PENDING expenses",
      );
    }
  }

  const expense = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({
      where: { id: expenseId },
      data: {
        status: ExpenseStatus.CANCELLED,
        isPaid: false,
        paidAt: null,
      },
      select: expenseSelect,
    });

    await deleteLedgerEntry("EXPENSE", updated.id, undefined, tx);

    return updated;
  });

  await recordAudit({
    userId: actor.id,
    action: "CANCEL_EXPENSE",
    entity: "Expense",
    entityId: expense.id,
    description: `Cancelled expense ${expense.id}`,
    oldData: existing,
    newData: expense,
    ipAddress,
  });

  return toExpenseResponse(expense);
};

export const getExpenseSummary = async (
  actor: AuthenticatedUser,
): Promise<ExpenseSummary> => {
  const where: Prisma.ExpenseWhereInput = {
    status: ExpenseStatus.APPROVED,
  };

  if (actor.role === Role.ADMIN) {
    where.createdById = actor.id;
    where.category = { in: ADMIN_ALLOWED_CATEGORIES };
  }

  const [aggregate, groups] = await Promise.all([
    prisma.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const [paidAggregate, unpaidAggregate] = await Promise.all([
    prisma.expense.aggregate({
      where: { ...where, isPaid: true },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { ...where, isPaid: false },
      _sum: { amount: true },
    }),
  ]);

  return {
    currency: env.STORE_CURRENCY,
    total: aggregate._sum.amount?.toNumber() ?? 0,
    count: aggregate._count._all,
    paid: paidAggregate._sum.amount?.toNumber() ?? 0,
    unpaid: unpaidAggregate._sum.amount?.toNumber() ?? 0,
    byCategory: groups.map((group) => ({
      category: group.category,
      total: group._sum.amount?.toNumber() ?? 0,
      count: group._count._all,
    })),
  };
};

export const listBills = async (
  actor: AuthenticatedUser,
  query: BillListQuery,
): Promise<{
  items: ExpenseResponse[];
  meta: ReturnType<typeof buildPaginationMeta>;
  summary: BillSummary;
}> => {
  const now = new Date();
  const baseWhere: Prisma.ExpenseWhereInput = {
    status: { not: ExpenseStatus.CANCELLED },
  };

  if (actor.role === Role.ADMIN) {
    baseWhere.createdById = actor.id;
    baseWhere.category = { in: ADMIN_ALLOWED_CATEGORIES };
  }

  const where: Prisma.ExpenseWhereInput = { ...baseWhere };

  if (query.filter === "PAID") {
    where.isPaid = true;
    where.dueDate = { not: null };
  } else if (query.filter === "UNPAID") {
    where.isPaid = false;
  } else if (query.filter === "UPCOMING") {
    where.isPaid = false;
    where.dueDate = { gte: now };
  } else if (query.filter === "OVERDUE") {
    where.isPaid = false;
    where.dueDate = { lt: now };
  }

  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const skip = (query.page - 1) * query.limit;

  const [
    bills,
    total,
    unpaidAggregate,
    overdueAggregate,
    upcomingAggregate,
    paidThisMonthAggregate,
  ] = await Promise.all([
    prisma.expense.findMany({
      where,
      select: expenseSelect,
      orderBy: [{ dueDate: "asc" }, { expenseDate: "desc" }],
      skip,
      take: query.limit,
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where: { ...baseWhere, isPaid: false },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: { ...baseWhere, isPaid: false, dueDate: { lt: now } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: { ...baseWhere, isPaid: false, dueDate: { gte: now } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: {
        ...baseWhere,
        status: ExpenseStatus.APPROVED,
        isPaid: true,
        paidAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    items: bills.map(toExpenseResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
    summary: {
      currency: env.STORE_CURRENCY,
      unpaidTotal: unpaidAggregate._sum.amount?.toNumber() ?? 0,
      unpaidCount: unpaidAggregate._count._all,
      overdueTotal: overdueAggregate._sum.amount?.toNumber() ?? 0,
      overdueCount: overdueAggregate._count._all,
      upcomingTotal: upcomingAggregate._sum.amount?.toNumber() ?? 0,
      upcomingCount: upcomingAggregate._count._all,
      paidThisMonthTotal:
        paidThisMonthAggregate._sum.amount?.toNumber() ?? 0,
    },
  };
};
