import {
  ExpenseCategory,
  ExpenseStatus,
  Prisma,
  SalaryStatus,
  TransactionType,
} from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { deleteLedgerEntry, upsertLedgerEntry } from "../../utils/ledger";
import { toDecimal } from "../../utils/money";
import { buildPaginationMeta } from "../../utils/pagination";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  CreateSalaryPaymentInput,
  PaginatedSalaryPayments,
  SalaryListQuery,
  SalaryPaymentResponse,
  SalarySummary,
} from "../../types/salary.types";

const salarySelect = {
  id: true,
  employeeId: true,
  month: true,
  year: true,
  amount: true,
  bonus: true,
  deduction: true,
  finalAmount: true,
  status: true,
  paymentDate: true,
  notes: true,
  expenseId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
    },
  },
} satisfies Prisma.SalaryPaymentSelect;

type SalaryRecord = Prisma.SalaryPaymentGetPayload<{
  select: typeof salarySelect;
}>;
type TxClient = Prisma.TransactionClient;

const toSalaryResponse = (salary: SalaryRecord): SalaryPaymentResponse => ({
  id: salary.id,
  employeeId: salary.employeeId,
  employee: salary.employee,
  month: salary.month,
  year: salary.year,
  amount: salary.amount.toNumber(),
  bonus: salary.bonus.toNumber(),
  deduction: salary.deduction.toNumber(),
  finalAmount: salary.finalAmount.toNumber(),
  status: salary.status,
  paymentDate: salary.paymentDate?.toISOString() ?? null,
  notes: salary.notes,
  expenseId: salary.expenseId,
  createdById: salary.createdById,
  createdAt: salary.createdAt.toISOString(),
  updatedAt: salary.updatedAt.toISOString(),
});

const createSalaryExpense = async (
  tx: TxClient,
  actor: AuthenticatedUser,
  employee: { id: string; name: string },
  month: number,
  year: number,
  amount: Prisma.Decimal,
  paymentDate: Date,
  notes?: string | null,
): Promise<string> => {
  const expense = await tx.expense.create({
    data: {
      category: ExpenseCategory.EMPLOYEE_SALARY,
      amount,
      description:
        notes?.trim() ||
        `Salary payment for ${employee.name} (${month}/${year})`,
      expenseDate: paymentDate,
      isPaid: true,
      paidAt: paymentDate,
      status: ExpenseStatus.APPROVED,
      createdById: actor.id,
      approvedById: actor.id,
    },
    select: { id: true },
  });

  await upsertLedgerEntry(
    {
      transactionType: TransactionType.EXPENSE,
      category: ExpenseCategory.EMPLOYEE_SALARY,
      amount,
      date: paymentDate,
      description: `Salary payment for ${employee.name} (${month}/${year})`,
      referenceType: "EXPENSE",
      referenceId: expense.id,
      createdById: actor.id,
      metadata: { employeeId: employee.id, month, year },
    },
    tx,
  );

  return expense.id;
};

export const createSalaryPayment = async (
  actor: AuthenticatedUser,
  input: CreateSalaryPaymentInput,
  ipAddress?: string,
): Promise<SalaryPaymentResponse> => {
  if (input.status === SalaryStatus.CANCELLED) {
    throw ApiError.badRequest("A new salary payment cannot be cancelled");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, name: true, monthlySalary: true, isActive: true },
  });

  if (!employee) {
    throw ApiError.notFound("Employee not found");
  }

  if (!employee.isActive) {
    throw ApiError.badRequest(
      "Cannot create a salary payment for an inactive employee",
    );
  }

  const amount = toDecimal(input.amount ?? employee.monthlySalary.toNumber());
  const bonus = toDecimal(input.bonus ?? 0);
  const deduction = toDecimal(input.deduction ?? 0);
  const finalAmount = amount.plus(bonus).minus(deduction);

  if (finalAmount.lessThanOrEqualTo(0)) {
    throw ApiError.badRequest("Final salary amount must be greater than zero");
  }

  const status = input.status ?? SalaryStatus.PAID;
  const paymentDate =
    status === SalaryStatus.PAID
      ? input.paymentDate
        ? new Date(input.paymentDate)
        : new Date()
      : null;

  const salary = await prisma.$transaction(async (tx) => {
    const existing = await tx.salaryPayment.findUnique({
      where: {
        employeeId_month_year: {
          employeeId: employee.id,
          month: input.month,
          year: input.year,
        },
      },
      select: salarySelect,
    });

    if (existing && existing.status !== SalaryStatus.CANCELLED) {
      throw ApiError.conflict(
        `Salary for ${employee.name} for ${input.month}/${input.year} already exists`,
      );
    }

    const expenseId =
      status === SalaryStatus.PAID && paymentDate
        ? await createSalaryExpense(
            tx,
            actor,
            employee,
            input.month,
            input.year,
            finalAmount,
            paymentDate,
            input.notes,
          )
        : null;

    const data = {
      employeeId: employee.id,
      month: input.month,
      year: input.year,
      amount,
      bonus,
      deduction,
      finalAmount,
      status,
      paymentDate,
      notes: input.notes?.trim() || null,
      createdById: actor.id,
      expenseId,
    };

    if (existing) {
      return tx.salaryPayment.update({
        where: { id: existing.id },
        data,
        select: salarySelect,
      });
    }

    return tx.salaryPayment.create({
      data,
      select: salarySelect,
    });
  });

  await recordAudit({
    userId: actor.id,
    action: "CREATE_SALARY_PAYMENT",
    entity: "SalaryPayment",
    entityId: salary.id,
    description: `Recorded salary of ${salary.finalAmount.toFixed(2)} for ${salary.employee.name} (${salary.month}/${salary.year})`,
    newData: salary,
    ipAddress,
  });

  return toSalaryResponse(salary);
};

export const listSalaryPayments = async (
  query: SalaryListQuery,
): Promise<PaginatedSalaryPayments> => {
  const where: Prisma.SalaryPaymentWhereInput = {};

  if (query.employeeId) {
    where.employeeId = query.employeeId;
  }

  if (query.month) {
    where.month = query.month;
  }

  if (query.year) {
    where.year = query.year;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.employee = {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { position: { contains: query.search, mode: "insensitive" } },
        { department: { contains: query.search, mode: "insensitive" } },
      ],
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [salaries, total] = await prisma.$transaction([
    prisma.salaryPayment.findMany({
      where,
      select: salarySelect,
      orderBy: [{ year: query.sortOrder }, { month: query.sortOrder }],
      skip,
      take: query.limit,
    }),
    prisma.salaryPayment.count({ where }),
  ]);

  return {
    items: salaries.map(toSalaryResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getSalaryPaymentById = async (
  salaryId: string,
): Promise<SalaryPaymentResponse> => {
  const salary = await prisma.salaryPayment.findUnique({
    where: { id: salaryId },
    select: salarySelect,
  });

  if (!salary) {
    throw ApiError.notFound("Salary payment not found");
  }

  return toSalaryResponse(salary);
};

export const paySalaryPayment = async (
  actor: AuthenticatedUser,
  salaryId: string,
  paymentDateInput?: string,
  ipAddress?: string,
): Promise<SalaryPaymentResponse> => {
  const existing = await prisma.salaryPayment.findUnique({
    where: { id: salaryId },
    select: salarySelect,
  });

  if (!existing) {
    throw ApiError.notFound("Salary payment not found");
  }

  if (existing.status === SalaryStatus.PAID) {
    return toSalaryResponse(existing);
  }

  if (existing.status === SalaryStatus.CANCELLED) {
    throw ApiError.badRequest("Cancelled salary payments cannot be paid");
  }

  const paymentDate = paymentDateInput
    ? new Date(paymentDateInput)
    : new Date();

  const salary = await prisma.$transaction(async (tx) => {
    const expenseId = await createSalaryExpense(
      tx,
      actor,
      existing.employee,
      existing.month,
      existing.year,
      existing.finalAmount,
      paymentDate,
      existing.notes,
    );

    return tx.salaryPayment.update({
      where: { id: salaryId },
      data: {
        status: SalaryStatus.PAID,
        paymentDate,
        expenseId,
      },
      select: salarySelect,
    });
  });

  await recordAudit({
    userId: actor.id,
    action: "PAY_SALARY",
    entity: "SalaryPayment",
    entityId: salary.id,
    description: `Paid salary ${salary.finalAmount.toFixed(2)} to ${salary.employee.name}`,
    oldData: existing,
    newData: salary,
    ipAddress,
  });

  return toSalaryResponse(salary);
};

export const cancelSalaryPayment = async (
  actor: AuthenticatedUser,
  salaryId: string,
  ipAddress?: string,
): Promise<SalaryPaymentResponse> => {
  const existing = await prisma.salaryPayment.findUnique({
    where: { id: salaryId },
    select: salarySelect,
  });

  if (!existing) {
    throw ApiError.notFound("Salary payment not found");
  }

  if (existing.status === SalaryStatus.CANCELLED) {
    return toSalaryResponse(existing);
  }

  const salary = await prisma.$transaction(async (tx) => {
    if (existing.expenseId) {
      await tx.expense.update({
        where: { id: existing.expenseId },
        data: {
          status: ExpenseStatus.CANCELLED,
          isPaid: false,
          paidAt: null,
        },
      });

      await deleteLedgerEntry(
        "EXPENSE",
        existing.expenseId,
        TransactionType.EXPENSE,
        tx,
      );
    }

    return tx.salaryPayment.update({
      where: { id: salaryId },
      data: {
        status: SalaryStatus.CANCELLED,
        paymentDate: null,
      },
      select: salarySelect,
    });
  });

  await recordAudit({
    userId: actor.id,
    action: "CANCEL_SALARY_PAYMENT",
    entity: "SalaryPayment",
    entityId: salary.id,
    description: `Cancelled salary payment for ${salary.employee.name}`,
    oldData: existing,
    newData: salary,
    ipAddress,
  });

  return toSalaryResponse(salary);
};

export const getSalarySummary = async (
  year: number,
): Promise<SalarySummary> => {
  const [paid, pending, byMonth] = await Promise.all([
    prisma.salaryPayment.aggregate({
      where: { year, status: SalaryStatus.PAID },
      _sum: { finalAmount: true },
      _count: { _all: true },
    }),
    prisma.salaryPayment.aggregate({
      where: { year, status: SalaryStatus.PENDING },
      _sum: { finalAmount: true },
      _count: { _all: true },
    }),
    prisma.salaryPayment.groupBy({
      by: ["year", "month"],
      where: { year, status: SalaryStatus.PAID },
      _sum: { finalAmount: true },
      orderBy: { month: "asc" },
    }),
  ]);

  return {
    currency: env.STORE_CURRENCY,
    totalPaid: paid._sum.finalAmount?.toNumber() ?? 0,
    totalPending: pending._sum.finalAmount?.toNumber() ?? 0,
    paidCount: paid._count._all,
    pendingCount: pending._count._all,
    byMonth: byMonth.map((group) => ({
      year: group.year,
      month: group.month,
      total: group._sum.finalAmount?.toNumber() ?? 0,
    })),
  };
};
