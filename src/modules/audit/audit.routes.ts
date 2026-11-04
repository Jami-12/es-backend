import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { auditLogListQuerySchema } from "../../validations/audit.validation";
import * as auditController from "./audit.controller";

const router = Router();

router.use(authenticate, authorize([Role.SUPER_ADMIN]));

router.get(
  "/",
  validate({ query: auditLogListQuerySchema }),
  auditController.listAuditLogs,
);

export const auditRoutes = router;
