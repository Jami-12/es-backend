import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  createProductDiscountSchema,
  productIdParamSchema,
  updateProductDiscountSchema,
} from "../../validations/product.validation";
import * as productDiscountController from "./product-discount.controller";

const router = Router({ mergeParams: true });

router.use(authenticate, authorize([Role.SUPER_ADMIN]));

router.get(
  "/",
  validate({ params: productIdParamSchema }),
  productDiscountController.getProductDiscount,
);

router.post(
  "/",
  validate({ params: productIdParamSchema, body: createProductDiscountSchema }),
  productDiscountController.createProductDiscount,
);

router.patch(
  "/",
  validate({ params: productIdParamSchema, body: updateProductDiscountSchema }),
  productDiscountController.updateProductDiscount,
);

router.delete(
  "/",
  validate({ params: productIdParamSchema }),
  productDiscountController.deleteProductDiscount,
);

export const productDiscountRoutes = router;
