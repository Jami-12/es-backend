import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  createAdminSchema,
  updateSelfProfileSchema,
  updateUserRoleSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userListQuerySchema,
} from "../../validations/user.validation";
import * as userController from "./user.controller";

const router = Router();

router.use(authenticate);

router.get("/me", userController.getSelfProfile);

router.patch(
  "/me",
  validate({ body: updateSelfProfileSchema }),
  userController.updateSelfProfile,
);

router.use(authorize([Role.SUPER_ADMIN]));

router.get(
  "/",
  validate({ query: userListQuerySchema }),
  userController.listUsers,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  userController.getUser,
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateUserSchema }),
  userController.updateUser,
);

router.post(
  "/admins",
  validate({ body: createAdminSchema }),
  userController.createAdmin,
);

router.patch(
  "/:id/role",
  validate({ params: idParamSchema, body: updateUserRoleSchema }),
  userController.updateUserRole,
);

router.patch(
  "/:id/status",
  validate({ params: idParamSchema, body: updateUserStatusSchema }),
  userController.updateUserStatus,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  userController.deleteUser,
);

export const userRoutes = router;
