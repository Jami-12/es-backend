import { Prisma, TransactionType } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { endOfDay, startOfDay } from "../../utils/dateRange";
import { deleteLedgerEntry, upsertLedgerEntry } from "../../utils/ledger";
import { toDecimal } from "../../utils/money";
import { buildPaginationMeta } from "../../utils/pagination";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  CreateInvestmentInput,
  InvestmentListQuery,
  InvestmentResponse,
  InvestmentSummary,
  PaginatedInvestments,
  UpdateInvestmentInput,
} from "../../types/investment.types";

const investmentSelect = {
  id: true,
  amount: true,
  source: true,
  description: true,
  investmentDate: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InvestmentSelect;

type InvestmentRecord = Prisma.InvestmentGetPayload<{
  select: typeof investmentSelect;
}>;
type TxClient = Prisma.TransactionClient;

const toInvestmentResponse = (
  investment: InvestmentRecord,
): InvestmentResponse => ({
  id: investment.id,
  amount: investment.amount.toNumber(),
  source: investment.source,
  description: investment.description,
  investmentDate: investment.investmentDate.toISOString(),
  createdById: investment.createdById,
  createdAt: investment.createdAt.toISOString(),
  updatedAt: investment.updatedAt.toISOString(),
});

const syncInvestmentLedger = async (
  investment: InvestmentRecord,
  client: TxClient,
): Promise<void> => {
  await upsertLedgerEntry(
    {
      transactionType: TransactionType.INVESTMENT,
      category: "INVESTMENT",
      amount: investment.amount,
      date: investment.investmentDate,
      description: investment.description ?? `Investment from ${investment.source}`,
      referenceType: "INVESTMENT",
      referenceId: investment.id,
      createdById: investment.createdById,
      metadata: { source: investment.source },
    },
    client,
  );
};

export const createInvestment = async (
  actor: AuthenticatedUser,
  input: CreateInvestmentInput,
  ipAddress?: string,
): Promise<InvestmentResponse> => {
  const investment = await prisma.$transaction(async (tx) => {
    const created = await tx.investment.create({
      data: {
        amount: toDecimal(input.amount),
        source: input.source.trim(),
        description: input.description?.trim() || null,
        investmentDate: input.investmentDate
          ? new Date(input.investmentDate)
          : new Date(),
        createdById: actor.id,
      },
      select: investmentSelect,
    });

    await syncInvestmentLedger(created, tx);

    return created;
  });

  await recordAudit({
    userId: actor.id,
    action: "CREATE_INVESTMENT",
    entity: "Investment",
    entityId: investment.id,
    description: `Recorded investment of ${investment.amount.toFixed(2)} from ${investment.source}`,
    newData: investment,
    ipAddress,
  });

  return toInvestmentResponse(investment);
};

export const listInvestments = async (
  query: InvestmentListQuery,
): Promise<PaginatedInvestments> => {
  const where: Prisma.InvestmentWhereInput = {};

  if (query.startDate || query.endDate) {
    where.investmentDate = {
      ...(query.startDate && { gte: startOfDay(query.startDate) }),
      ...(query.endDate && { lte: endOfDay(query.endDate) }),
    };
  }

  if (query.search) {
    where.OR = [
      { source: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [investments, total] = await prisma.$transaction([
    prisma.investment.findMany({
      where,
      select: investmentSelect,
      orderBy: { investmentDate: query.sortOrder },
      skip,
      take: query.limit,
    }),
    prisma.investment.count({ where }),
  ]);

  return {
    items: investments.map(toInvestmentResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getInvestmentById = async (
  investmentId: string,
): Promise<InvestmentResponse> => {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: investmentSelect,
  });

  if (!investment) {
    throw ApiError.notFound("Investment not found");
  }

  return toInvestmentResponse(investment);
};

export const updateInvestment = async (
  investmentId: string,
  input: UpdateInvestmentInput,
  actor: AuthenticatedUser,
  ipAddress?: string,
): Promise<InvestmentResponse> => {
  const existing = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: investmentSelect,
  });

  if (!existing) {
    throw ApiError.notFound("Investment not found");
  }

  const data: Prisma.InvestmentUncheckedUpdateInput = {};

  if (input.amount !== undefined) {
    data.amount = toDecimal(input.amount);
  }

  if (input.source !== undefined) {
    data.source = input.source.trim();
  }

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (input.investmentDate !== undefined) {
    data.investmentDate = new Date(input.investmentDate);
  }

  const investment = await prisma.$transaction(async (tx) => {
    const updated = await tx.investment.update({
      where: { id: investmentId },
      data,
      select: investmentSelect,
    });

    await syncInvestmentLedger(updated, tx);

    return updated;
  });

  await recordAudit({
    userId: actor.id,
    action: "UPDATE_INVESTMENT",
    entity: "Investment",
    entityId: investment.id,
    description: `Updated investment ${investment.id}`,
    oldData: existing,
    newData: investment,
    ipAddress,
  });

  return toInvestmentResponse(investment);
};

export const deleteInvestment = async (
  investmentId: string,
  actor: AuthenticatedUser,
  ipAddress?: string,
): Promise<void> => {
  const existing = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: investmentSelect,
  });

  if (!existing) {
    throw ApiError.notFound("Investment not found");
  }

  await prisma.$transaction(async (tx) => {
    await deleteLedgerEntry("INVESTMENT", investmentId, undefined, tx);
    await tx.investment.delete({ where: { id: investmentId } });
  });

  await recordAudit({
    userId: actor.id,
    action: "DELETE_INVESTMENT",
    entity: "Investment",
    entityId: investmentId,
    description: `Deleted investment ${investmentId}`,
    oldData: existing,
    ipAddress,
  });
};

export const getInvestmentSummary = async (): Promise<InvestmentSummary> => {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [total, thisMonth, thisYear] = await Promise.all([
    prisma.investment.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.investment.aggregate({
      where: { investmentDate: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.investment.aggregate({
      where: { investmentDate: { gte: yearStart } },
      _sum: { amount: true },
    }),
  ]);

  return {
    currency: env.STORE_CURRENCY,
    total: total._sum.amount?.toNumber() ?? 0,
    count: total._count._all,
    thisMonth: thisMonth._sum.amount?.toNumber() ?? 0,
    thisYear: thisYear._sum.amount?.toNumber() ?? 0,
  };
};
