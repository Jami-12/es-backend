import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import {
  guestCheckoutSchema,
  guestOrderAccessSchema,
  orderTrackingQuerySchema,
} from "../../validations/order.validation";
import { idParamSchema } from "../../validations/common.validation";
import * as orderController from "./order.controller";

/**
 * Public order endpoints. Registered before the authenticated order router so
 * tracking and guest checkout work without a login. Guest order access always
 * requires the random token returned at checkout; no personal data is exposed
 * by the tracking lookup.
 */
const router = Router();

router.get(
  "/track",
  validate({ query: orderTrackingQuerySchema }),
  orderController.trackOrder,
);

router.post(
  "/guest-checkout",
  validate({ body: guestCheckoutSchema }),
  orderController.guestCheckout,
);

router.get(
  "/guest/:id/receipt",
  validate({ params: idParamSchema, query: guestOrderAccessSchema }),
  orderController.getGuestOrderReceipt,
);

router.get(
  "/guest/:id",
  validate({ params: idParamSchema, query: guestOrderAccessSchema }),
  orderController.getGuestOrder,
);

export const publicOrderRoutes = router;
