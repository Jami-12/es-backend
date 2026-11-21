import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// Reuse the client across module reloads and warm serverless invocations.
// Each Vercel instance gets one pool instead of a new client per invocation.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDevelopment ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;

export const connectDatabase = async (): Promise<void> => {
  await prisma.$connect();
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
