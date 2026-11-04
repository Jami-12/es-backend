import type { PaginatedResult } from "./common.types";

export interface CreateEmployeeInput {
  name: string;
  email?: string;
  phone?: string;
  position: string;
  department?: string;
  monthlySalary: number;
  joiningDate: string;
  isActive?: boolean;
}

export interface UpdateEmployeeInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  position?: string;
  department?: string | null;
  monthlySalary?: number;
  joiningDate?: string;
  isActive?: boolean;
}

export interface EmployeeListQuery {
  page: number;
  limit: number;
  isActive?: boolean;
  department?: string;
  search?: string;
  sortOrder: "asc" | "desc";
}

export interface EmployeeResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string;
  department: string | null;
  monthlySalary: number;
  joiningDate: string;
  isActive: boolean;
  createdById: string | null;
  salaryPaymentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeSummary {
  currency: string;
  total: number;
  active: number;
  inactive: number;
  monthlyPayroll: number;
  departments: { department: string | null; count: number }[];
}

export type PaginatedEmployees = PaginatedResult<EmployeeResponse>;
