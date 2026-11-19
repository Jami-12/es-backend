import type { AuthProvider, Role, UserStatus } from "@prisma/client";
import type { PaginatedResult } from "./common.types";

export interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string | null;
  image?: string | null;
}

export interface UpdateSelfProfileInput {
  name?: string;
  email?: string;
  phone?: string | null;
  image?: string | null;
}

export interface UpdateUserRoleInput {
  role: Role;
}

export interface UpdateUserStatusInput {
  status?: UserStatus;
  isActive?: boolean;
}

export interface UserListQuery {
  page: number;
  limit: number;
  role?: Role;
  status?: UserStatus;
  isActive?: boolean;
  name?: string;
  email?: string;
  search?: string;
  includeDeleted?: boolean;
  sortOrder: "asc" | "desc";
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  role: Role;
  status: UserStatus;
  provider: AuthProvider;
  isActive: boolean;
  deletedAt: string | null;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedUsers = PaginatedResult<UserResponse>;

export interface CustomerListQuery {
  page: number;
  limit: number;
  status?: UserStatus;
  search?: string;
  sortOrder: "asc" | "desc";
}

export interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  isActive: boolean;
  orderCount: number;
  paidOrderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string;
}

export type PaginatedCustomers = PaginatedResult<CustomerSummary>;
