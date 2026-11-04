import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  checkoutSchema,
  orderListQuerySchema,
} from "../../validations/order.validation";
import * as orderController from "./order.controller";

const router = Router();

router.use(authenticate);

router.post(
  "/checkout",
  authorize([Role.CUSTOMER]),
  validate({ body: checkoutSchema }),
  orderController.checkout,
);

router.get(
  "/my-orders",
  authorize([Role.CUSTOMER]),
  validate({ query: orderListQuerySchema }),
  orderController.listMyOrders,
);

router.get(
  "/:id/receipt",
  validate({ params: idParamSchema }),
  orderController.getOrderReceipt,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  orderController.getOrder,
);

router.post(
  "/:id/cancel",
  authorize([Role.CUSTOMER]),
  validate({ params: idParamSchema }),
  orderController.cancelOrder,
);

export const orderRoutes = router;
