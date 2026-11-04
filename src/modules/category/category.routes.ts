import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  categoryListQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from "../../validations/category.validation";
import * as categoryController from "./category.controller";

const router = Router();

router.get(
  "/",
  validate({ query: categoryListQuerySchema }),
  categoryController.listCategories,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  categoryController.getCategory,
);

router.use(authenticate, authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.post(
  "/",
  validate({ body: createCategorySchema }),
  categoryController.createCategory,
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateCategorySchema }),
  categoryController.updateCategory,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  categoryController.deleteCategory,
);

export const categoryRoutes = router;
