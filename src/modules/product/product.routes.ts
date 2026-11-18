import { Role } from "@prisma/client";
import { Router } from "express";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
  updateProductStatusSchema,
} from "../../validations/product.validation";
import * as productController from "./product.controller";

const router = Router();

router.get(
  "/",
  optionalAuthenticate,
  validate({ query: productListQuerySchema }),
  productController.listProducts,
);

router.get(
  "/slug/:slug",
  optionalAuthenticate,
  productController.getProductBySlug,
);

router.get(
  "/:id",
  optionalAuthenticate,
  validate({ params: idParamSchema }),
  productController.getProduct,
);

router.use(authenticate, authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.post(
  "/",
  validate({ body: createProductSchema }),
  productController.createProduct,
);

router.patch(
  "/:id/status",
  validate({ params: idParamSchema, body: updateProductStatusSchema }),
  productController.updateProductStatus,
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateProductSchema }),
  productController.updateProduct,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  productController.deleteProduct,
);

export const productRoutes = router;
