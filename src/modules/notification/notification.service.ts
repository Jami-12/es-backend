import { Prisma, type Notification } from "@prisma/client";
import { prisma } from "../../config/prisma";
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
  title: notification.title,
  message: notification.message,
  type: notification.type,
  isRead: notification.isRead,
  createdAt: notification.createdAt.toISOString(),
});

export const listNotifications = async (
  userId: string,
  query: NotificationListQuery,
): Promise<PaginatedNotifications> => {
  const where: Prisma.NotificationWhereInput = { userId };

  if (typeof query.isRead === "boolean") {
    where.isRead = query.isRead;
  }

  if (query.type) {
    where.type = query.type;
  }

  const skip = (query.page - 1) * query.limit;

  const [notifications, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
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

  if (!notification || notification.userId !== userId) {
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
): Promise<{ updatedCount: number }> => {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
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
    select: { id: true, userId: true },
  });

  if (!notification || notification.userId !== userId) {
    throw ApiError.notFound("Notification not found");
  }

  await prisma.notification.delete({ where: { id: notificationId } });
};
