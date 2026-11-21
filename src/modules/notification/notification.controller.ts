import type { NotificationListQuery } from "../../types/notification.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as notificationService from "./notification.service";

export const listNotifications = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await notificationService.listNotifications(
    user.id,
    user.role,
    req.query as unknown as NotificationListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Notifications retrieved successfully",
  });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const notification = await notificationService.markNotificationRead(
    user.id,
    req.params.id,
  );

  sendSuccess(res, {
    data: { notification },
    message: "Notification marked as read",
  });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await notificationService.markAllNotificationsRead(user.id, user.role);

  sendSuccess(res, {
    data: result,
    message: "All notifications marked as read",
  });
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  await notificationService.deleteNotification(user.id, req.params.id);

  sendSuccess(res, {
    data: null,
    message: "Notification deleted successfully",
  });
});
