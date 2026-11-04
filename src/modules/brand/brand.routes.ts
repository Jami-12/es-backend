import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  brandListQuerySchema,
  createBrandSchema,
  updateBrandSchema,
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

router.post(
  "/",
  validate({ body: createBrandSchema }),
  brandController.createBrand,
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateBrandSchema }),
  brandController.updateBrand,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  brandController.deleteBrand,
);

export const brandRoutes = router;
