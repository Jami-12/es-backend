import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

export interface AuditInput {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  description?: string;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string;
}

const toJsonValue = (
  value: unknown,
): Prisma.InputJsonValue | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

export const recordAudit = async (
  input: AuditInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> => {
  await client.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      description: input.description,
      oldData: toJsonValue(input.oldData),
      newData: toJsonValue(input.newData),
      ipAddress: input.ipAddress,
    },
  });
};
