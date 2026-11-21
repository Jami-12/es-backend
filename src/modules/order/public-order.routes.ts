import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { orderTrackingQuerySchema } from "../../validations/order.validation";
import * as orderController from "./order.controller";

/**
 * Public order tracking. Registered before the authenticated order router so
 * customers can track an order without signing in. No personal data is
 * returned; see `trackOrder` in order.service.ts.
 */
const router = Router();

router.get(
  "/track",
  validate({ query: orderTrackingQuerySchema }),
  orderController.trackOrder,
);

export const publicOrderRoutes = router;
