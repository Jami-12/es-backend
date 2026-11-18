import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { entityImageUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  brandListQuerySchema,
  createBrandSchema,
  updateBrandSchema,
  updateBrandStatusSchema,
} from "../../validations/brand.validation";
import * as brandController from "./brand.controller";

const router = Router();

router.get(
  "/",
  validate({ query: brandListQuerySchema }),
  brandController.listBrands,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  brandController.getBrand,
);

router.use(authenticate, authorize([Role.SUPER_ADMIN, Role.ADMIN]));

const brandImageUpload = entityImageUpload({
  folder: "brands",
  fields: ["logo", "image", "file"],
  urlField: "logo",
  publicIdField: "",
});

router.post(
  "/",
  brandImageUpload,
  validate({ body: createBrandSchema }),
  brandController.createBrand,
);

router.patch(
  "/:id/status",
  validate({ params: idParamSchema, body: updateBrandStatusSchema }),
  brandController.updateBrandStatus,
);

router.patch(
  "/:id",
  brandImageUpload,
  validate({ params: idParamSchema, body: updateBrandSchema }),
  brandController.updateBrand,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  brandController.deleteBrand,
);

export const brandRoutes = router;
