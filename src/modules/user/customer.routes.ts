import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { customerListQuerySchema } from "../../validations/user.validation";
import * as customerController from "./customer.controller";

const router = Router();

router.use(authenticate, authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.get(
  "/",
  validate({ query: customerListQuerySchema }),
  customerController.listCustomers,
);

export const customerRoutes = router;
