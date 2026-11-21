import { Prisma, Role, UserStatus } from "@prisma/client";

/** Marks the notifications that represent a brand-new incoming order. */
export const ORDER_PLACED_EVENT = "ORDER_PLACED";

export interface OrderNotificationInput {
  /** Customer who owns the order. Always receives the customer-facing message. */
  customerId: string;
  title: string;
  message: string;
  /** All order/payment events are surfaced as order notifications. */
  type?: "ORDER";
  /** Optional admin-facing wording (defaults to the customer message). */
  adminTitle?: string;
  adminMessage?: string;
  /** Structured link to the order this notification is about. */
  orderId?: string;
  /** Stable event key used by the shop/admin inbox to filter incoming orders. */
  eventType?: string;
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

  await Promise.all(
    [...recipients].map((userId) => {
      const isAdmin = userId !== input.customerId;

      return tx.notification.create({
        data: {
          userId,
          title: isAdmin ? (input.adminTitle ?? input.title) : input.title,
          message: isAdmin ? (input.adminMessage ?? input.message) : input.message,
          type: input.type ?? "ORDER",
          orderId: input.orderId ?? null,
          eventType: input.eventType ?? null,
        },
      });
    }),
  );
};
