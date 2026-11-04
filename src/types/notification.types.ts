import type { NotificationType } from "@prisma/client";
import type { PaginatedResult } from "./common.types";

export interface NotificationListQuery {
  page: number;
  limit: number;
  isRead?: boolean;
  type?: NotificationType;
}

export interface NotificationResponse {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedNotifications extends PaginatedResult<NotificationResponse> {
  unreadCount: number;
}
