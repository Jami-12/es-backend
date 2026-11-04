import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import { notificationListQuerySchema } from "../../validations/notification.validation";
import * as notificationController from "./notification.controller";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  validate({ query: notificationListQuerySchema }),
  notificationController.listNotifications,
);

router.patch(
  "/read-all",
  notificationController.markAllNotificationsRead,
);

router.patch(
  "/:id/read",
  validate({ params: idParamSchema }),
  notificationController.markNotificationRead,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  notificationController.deleteNotification,
);

export const notificationRoutes = router;
