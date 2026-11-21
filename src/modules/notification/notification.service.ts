import { NotificationType, Prisma, Role, type Notification } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ORDER_PLACED_EVENT } from "./notification-events";
import { ApiError } from "../../utils/ApiError";
import { buildPaginationMeta } from "../../utils/pagination";
import type {
  NotificationListQuery,
  NotificationResponse,
  PaginatedNotifications,
} from "../../types/notification.types";

const toNotificationResponse = (
  notification: Notification,
): NotificationResponse => ({
  id: notification.id,
  userId: notification.userId,
  orderId: notification.orderId,
  eventType: notification.eventType,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  isRead: notification.isRead,
  createdAt: notification.createdAt.toISOString(),
});

// The notification centre is order-only. Shop admins see only brand-new
// incoming orders; customers still see every update about their own orders.
const ORDER_NOTIFICATION_WHERE: Prisma.NotificationWhereInput = {
  type: NotificationType.ORDER,
};

const feedWhere = (
  userId: string,
  role: Role,
): Prisma.NotificationWhereInput => ({
  ...ORDER_NOTIFICATION_WHERE,
  userId,
  ...(role === Role.ADMIN || role === Role.SUPER_ADMIN
    ? { eventType: ORDER_PLACED_EVENT }
    : {}),
});

export const listNotifications = async (
  userId: string,
  role: Role,
  query: NotificationListQuery,
): Promise<PaginatedNotifications> => {
  if (query.type && query.type !== NotificationType.ORDER) {
    // Non-order types are never returned by this endpoint.
    return {
      items: [],
      meta: buildPaginationMeta(query.page, query.limit, 0),
      unreadCount: 0,
    };
  }

  const where = feedWhere(userId, role);
  const unreadWhere: Prisma.NotificationWhereInput = {
    ...where,
    isRead: false,
  };
  const skip = (query.page - 1) * query.limit;

  const [notifications, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: unreadWhere }),
  ]);

  return {
    items: notifications.map(toNotificationResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
    unreadCount,
  };
};

export const markNotificationRead = async (
  userId: string,
  notificationId: string,
): Promise<NotificationResponse> => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (
    !notification ||
    notification.userId !== userId ||
    notification.type !== NotificationType.ORDER
  ) {
    throw ApiError.notFound("Notification not found");
  }

  if (notification.isRead) {
    return toNotificationResponse(notification);
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  return toNotificationResponse(updated);
};

export const markAllNotificationsRead = async (
  userId: string,
  role: Role,
): Promise<{ updatedCount: number }> => {
  const result = await prisma.notification.updateMany({
    where: { ...feedWhere(userId, role), isRead: false },
    data: { isRead: true },
  });

  return { updatedCount: result.count };
};

export const deleteNotification = async (
  userId: string,
  notificationId: string,
): Promise<void> => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true, type: true },
  });

  if (
    !notification ||
    notification.userId !== userId ||
    notification.type !== NotificationType.ORDER
  ) {
    throw ApiError.notFound("Notification not found");
  }

  await prisma.notification.delete({ where: { id: notificationId } });
};
