import { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "../config/prisma";

export interface LedgerEntryInput {
  transactionType: TransactionType;
  category: string;
  amount: Prisma.Decimal;
  date?: Date;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdById?: string | null;
  metadata?: unknown;
}

type LedgerClient = Prisma.TransactionClient | typeof prisma;

const toJsonValue = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

export const upsertLedgerEntry = async (
  input: LedgerEntryInput,
  client: LedgerClient = prisma,
): Promise<void> => {
  const referenceType = input.referenceType ?? null;
  const referenceId = input.referenceId ?? null;

  const existing =
    referenceType && referenceId
      ? await client.financialTransaction.findFirst({
          where: {
            referenceType,
            referenceId,
            transactionType: input.transactionType,
          },
          select: { id: true },
        })
      : null;

  const data = {
    transactionType: input.transactionType,
    category: input.category,
    amount: input.amount,
    date: input.date ?? new Date(),
    description: input.description ?? null,
    referenceType,
    referenceId,
    createdById: input.createdById ?? null,
    metadata: toJsonValue(input.metadata),
  };

  if (existing) {
    await client.financialTransaction.update({
      where: { id: existing.id },
      data,
    });

    return;
  }

  await client.financialTransaction.create({ data });
};

export const deleteLedgerEntry = async (
  referenceType: string,
  referenceId: string,
  transactionType?: TransactionType,
  client: LedgerClient = prisma,
): Promise<void> => {
  await client.financialTransaction.deleteMany({
    where: {
      referenceType,
      referenceId,
      ...(transactionType ? { transactionType } : {}),
    },
  });
};

export const recordIncome = async (
  input: Omit<LedgerEntryInput, "transactionType" | "category"> & {
    category?: string;
  },
  client: LedgerClient = prisma,
): Promise<void> => {
  await upsertLedgerEntry(
    {
      ...input,
      transactionType: TransactionType.INCOME,
      category: input.category ?? "SALES_REVENUE",
    },
    client,
  );
};

export const recordRefund = async (
  input: Omit<LedgerEntryInput, "transactionType" | "category"> & {
    category?: string;
  },
  client: LedgerClient = prisma,
): Promise<void> => {
  await upsertLedgerEntry(
    {
      ...input,
      transactionType: TransactionType.REFUND,
      category: input.category ?? "SALES_REFUND",
    },
    client,
  );
};
