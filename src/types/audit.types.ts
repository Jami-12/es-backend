import type { PaginatedResult } from "./common.types";

export interface AuditLogListQuery {
  page: number;
  limit: number;
  action?: string;
  entity?: string;
  userId?: string;
  search?: string;
  sortOrder: "asc" | "desc";
}

export interface AuditLogResponse {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string | null;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export type PaginatedAuditLogs = PaginatedResult<AuditLogResponse>;
