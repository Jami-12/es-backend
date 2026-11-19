import { Prisma, Role, UserStatus } from "@prisma/client";

export interface OrderNotificationInput {
  /** Customer who owns the order. Always receives the customer-facing message. */
  customerId: string;
  title: string;
  message: string;
  type?: "ORDER" | "PAYMENT";
  /** Optional admin-facing wording (defaults to the customer message). */
  adminTitle?: string;
  adminMessage?: string;
}

/**
 * Creates a notification for the customer and every active admin/super-admin.
 *
 * Called inside the order/payment transaction so the alert is committed with
 * the status change it describes. Inactive, blocked and soft-deleted accounts
 * are skipped, and the customer is never notified twice if they are an admin.
 */
export const notifyCustomerAndAdmins = async (
  tx: Prisma.TransactionClient,
  input: OrderNotificationInput,
): Promise<void> => {
  const admins = await tx.user.findMany({
    where: {
      role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
      status: UserStatus.ACTIVE,
      isActive: true,
      deletedAt: null,
      id: { not: input.customerId },
    },
    select: { id: true },
  });

  const recipients = new Set<string>([
    input.customerId,
    ...admins.map((admin) => admin.id),
  ]);

  for (const userId of recipients) {
    const isAdmin = userId !== input.customerId;

    await tx.notification.create({
      data: {
        userId,
        title: isAdmin ? (input.adminTitle ?? input.title) : input.title,
        message: isAdmin ? (input.adminMessage ?? input.message) : input.message,
        type: input.type ?? "ORDER",
      },
    });
  }
};
