import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  couponListQuerySchema,
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
} from "../../validations/coupon.validation";
import * as couponController from "./coupon.controller";

const router = Router();

router.use(authenticate);

router.post(
  "/validate",
  authorize([Role.CUSTOMER]),
  validate({ body: validateCouponSchema }),
  couponController.validateCoupon,
);

router.get(
  "/",
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ query: couponListQuerySchema }),
  couponController.listCoupons,
);

router.get(
  "/:id",
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ params: idParamSchema }),
  couponController.getCoupon,
);

router.post(
  "/",
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ body: createCouponSchema }),
  couponController.createCoupon,
);

router.patch(
  "/:id",
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ params: idParamSchema, body: updateCouponSchema }),
  couponController.updateCoupon,
);

router.delete(
  "/:id",
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ params: idParamSchema }),
  couponController.deleteCoupon,
);

export const couponRoutes = router;
