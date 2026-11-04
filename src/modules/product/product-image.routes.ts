import { Role } from "@prisma/client";
import { Router } from "express";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { productImageUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  productIdParamSchema,
  productImageParamSchema,
  productImageUploadSchema,
  reorderProductImagesSchema,
  updateProductImageSchema,
} from "../../validations/product.validation";
import * as productImageController from "./product-image.controller";

const router = Router({ mergeParams: true });

router.get(
  "/",
  optionalAuthenticate,
  validate({ params: productIdParamSchema }),
  productImageController.listProductImages,
);

router.use(authenticate, authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.post(
  "/",
  productImageUpload,
  validate({
    params: productIdParamSchema,
    body: productImageUploadSchema,
  }),
  productImageController.uploadProductImages,
);

router.patch(
  "/reorder",
  validate({
    params: productIdParamSchema,
    body: reorderProductImagesSchema,
  }),
  productImageController.reorderProductImages,
);

router.patch(
  "/:imageId/primary",
  validate({ params: productImageParamSchema }),
  productImageController.setPrimaryProductImage,
);

router.patch(
  "/:imageId",
  validate({
    params: productImageParamSchema,
    body: updateProductImageSchema,
  }),
  productImageController.updateProductImage,
);

router.delete(
  "/:imageId",
  validate({ params: productImageParamSchema }),
  productImageController.deleteProductImage,
);

export const productImageRoutes = router;
