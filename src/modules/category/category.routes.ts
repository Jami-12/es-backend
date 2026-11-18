import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { entityImageUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  categoryListQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
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

const categoryImageUpload = entityImageUpload({
  folder: "categories",
  fields: ["image", "file"],
  urlField: "image",
  publicIdField: "",
});

router.post(
  "/",
  categoryImageUpload,
  validate({ body: createCategorySchema }),
  categoryController.createCategory,
);

router.patch(
  "/:id/status",
  validate({ params: idParamSchema, body: updateCategoryStatusSchema }),
  categoryController.updateCategoryStatus,
);

router.patch(
  "/:id",
  categoryImageUpload,
  validate({ params: idParamSchema, body: updateCategorySchema }),
  categoryController.updateCategory,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  categoryController.deleteCategory,
);

export const categoryRoutes = router;
