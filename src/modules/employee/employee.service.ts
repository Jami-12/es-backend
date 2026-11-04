import { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { toDecimal } from "../../utils/money";
import { buildPaginationMeta } from "../../utils/pagination";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  EmployeeResponse,
  EmployeeSummary,
  PaginatedEmployees,
  UpdateEmployeeInput,
} from "../../types/employee.types";

const employeeSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  position: true,
  department: true,
  monthlySalary: true,
  joiningDate: true,
  isActive: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { salaries: true } },
} satisfies Prisma.EmployeeSelect;

type EmployeeRecord = Prisma.EmployeeGetPayload<{
  select: typeof employeeSelect;
}>;

const toEmployeeResponse = (employee: EmployeeRecord): EmployeeResponse => ({
  id: employee.id,
  name: employee.name,
  email: employee.email,
  phone: employee.phone,
  position: employee.position,
  department: employee.department,
  monthlySalary: employee.monthlySalary.toNumber(),
  joiningDate: employee.joiningDate.toISOString(),
  isActive: employee.isActive,
  createdById: employee.createdById,
  salaryPaymentsCount: employee._count.salaries,
  createdAt: employee.createdAt.toISOString(),
  updatedAt: employee.updatedAt.toISOString(),
});

export const createEmployee = async (
  actor: AuthenticatedUser,
  input: CreateEmployeeInput,
  ipAddress?: string,
): Promise<EmployeeResponse> => {
  const employee = await prisma.employee.create({
    data: {
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      position: input.position.trim(),
      department: input.department?.trim() || null,
      monthlySalary: toDecimal(input.monthlySalary),
      joiningDate: new Date(input.joiningDate),
      isActive: input.isActive ?? true,
      createdById: actor.id,
    },
    select: employeeSelect,
  });

  await recordAudit({
    userId: actor.id,
    action: "CREATE_EMPLOYEE",
    entity: "Employee",
    entityId: employee.id,
    description: `Created employee ${employee.name}`,
    newData: employee,
    ipAddress,
  });

  return toEmployeeResponse(employee);
};

export const listEmployees = async (
  query: EmployeeListQuery,
): Promise<PaginatedEmployees> => {
  const where: Prisma.EmployeeWhereInput = {};

  if (typeof query.isActive === "boolean") {
    where.isActive = query.isActive;
  }

  if (query.department) {
    where.department = { equals: query.department, mode: "insensitive" };
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
      { position: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [employees, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      select: employeeSelect,
      orderBy: { createdAt: query.sortOrder },
      skip,
      take: query.limit,
    }),
    prisma.employee.count({ where }),
  ]);

  return {
    items: employees.map(toEmployeeResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getEmployeeById = async (
  employeeId: string,
): Promise<EmployeeResponse> => {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: employeeSelect,
  });

  if (!employee) {
    throw ApiError.notFound("Employee not found");
  }

  return toEmployeeResponse(employee);
};

export const updateEmployee = async (
  actor: AuthenticatedUser,
  employeeId: string,
  input: UpdateEmployeeInput,
  ipAddress?: string,
): Promise<EmployeeResponse> => {
  const existing = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: employeeSelect,
  });

  if (!existing) {
    throw ApiError.notFound("Employee not found");
  }

  const data: Prisma.EmployeeUncheckedUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name.trim();
  }

  if (input.email !== undefined) {
    data.email = input.email?.trim() || null;
  }

  if (input.phone !== undefined) {
    data.phone = input.phone?.trim() || null;
  }

  if (input.position !== undefined) {
    data.position = input.position.trim();
  }

  if (input.department !== undefined) {
    data.department = input.department?.trim() || null;
  }

  if (input.monthlySalary !== undefined) {
    data.monthlySalary = toDecimal(input.monthlySalary);
  }

  if (input.joiningDate !== undefined) {
    data.joiningDate = new Date(input.joiningDate);
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  const employee = await prisma.employee.update({
    where: { id: employeeId },
    data,
    select: employeeSelect,
  });

  await recordAudit({
    userId: actor.id,
    action: "UPDATE_EMPLOYEE",
    entity: "Employee",
    entityId: employee.id,
    description: `Updated employee ${employee.name}`,
    oldData: existing,
    newData: employee,
    ipAddress,
  });

  return toEmployeeResponse(employee);
};

export const deactivateEmployee = async (
  actor: AuthenticatedUser,
  employeeId: string,
  ipAddress?: string,
): Promise<EmployeeResponse> => {
  const existing = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: employeeSelect,
  });

  if (!existing) {
    throw ApiError.notFound("Employee not found");
  }

  if (!existing.isActive) {
    return toEmployeeResponse(existing);
  }

  const employee = await prisma.employee.update({
    where: { id: employeeId },
    data: { isActive: false },
    select: employeeSelect,
  });

  await recordAudit({
    userId: actor.id,
    action: "DEACTIVATE_EMPLOYEE",
    entity: "Employee",
    entityId: employee.id,
    description: `Deactivated employee ${employee.name}`,
    oldData: existing,
    newData: employee,
    ipAddress,
  });

  return toEmployeeResponse(employee);
};

export const getEmployeeSummary = async (): Promise<EmployeeSummary> => {
  const [total, active, inactive, payroll, departments] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { isActive: true } }),
    prisma.employee.count({ where: { isActive: false } }),
    prisma.employee.aggregate({
      where: { isActive: true },
      _sum: { monthlySalary: true },
    }),
    prisma.employee.groupBy({
      by: ["department"],
      where: { isActive: true },
      _count: { _all: true },
    }),
  ]);

  return {
    currency: env.STORE_CURRENCY,
    total,
    active,
    inactive,
    monthlyPayroll: payroll._sum.monthlySalary?.toNumber() ?? 0,
    departments: departments.map((group) => ({
      department: group.department,
      count: group._count._all,
    })),
  };
};
