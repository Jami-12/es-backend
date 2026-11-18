import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  collectCodPaymentSchema,
  orderListQuerySchema,
  updateOrderStatusSchema,
} from "../../validations/order.validation";
import * as orderController from "./order.controller";

const router = Router();

router.use(authenticate, authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.get(
  "/",
  validate({ query: orderListQuerySchema }),
  orderController.adminListOrders,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  orderController.getOrder,
);

router.patch(
  "/:id/status",
  validate({ params: idParamSchema, body: updateOrderStatusSchema }),
  orderController.adminUpdateOrderStatus,
);

router.patch(
  "/:id/collect-payment",
  validate({ params: idParamSchema, body: collectCodPaymentSchema }),
  orderController.adminCollectCodPayment,
);

export const adminOrderRoutes = router;
