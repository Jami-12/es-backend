import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { buildPaginationMeta } from "../../utils/pagination";
import type {
  AuditLogListQuery,
  AuditLogResponse,
  PaginatedAuditLogs,
} from "../../types/audit.types";

const auditInclude = {
  user: {
    select: { id: true, name: true, email: true, role: true },
  },
} satisfies Prisma.AuditLogInclude;

type AuditRecord = Prisma.AuditLogGetPayload<{ include: typeof auditInclude }>;

const toAuditResponse = (log: AuditRecord): AuditLogResponse => ({
  id: log.id,
  userId: log.userId,
  action: log.action,
  entity: log.entity,
  entityId: log.entityId,
  description: log.description,
  oldData: log.oldData,
  newData: log.newData,
  ipAddress: log.ipAddress,
  createdAt: log.createdAt.toISOString(),
  user: log.user,
});

export const listAuditLogs = async (
  query: AuditLogListQuery,
): Promise<PaginatedAuditLogs> => {
  const where: Prisma.AuditLogWhereInput = {};

  if (query.action) {
    where.action = query.action.toUpperCase();
  }

  if (query.entity) {
    where.entity = { equals: query.entity, mode: "insensitive" };
  }

  if (query.userId) {
    where.userId = query.userId;
  }

  if (query.search) {
    where.OR = [
      { description: { contains: query.search, mode: "insensitive" } },
      { action: { contains: query.search, mode: "insensitive" } },
      { entity: { contains: query.search, mode: "insensitive" } },
      {
        user: {
          is: {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      include: auditInclude,
      orderBy: { createdAt: query.sortOrder },
      skip,
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: logs.map(toAuditResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};
