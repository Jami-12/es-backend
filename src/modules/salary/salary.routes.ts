import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  createSalaryPaymentSchema,
  paySalarySchema,
  salaryListQuerySchema,
  salarySummaryQuerySchema,
} from "../../validations/salary.validation";
import * as salaryController from "./salary.controller";

const router = Router();

router.use(authenticate);
router.use(authorize([Role.SUPER_ADMIN]));

router.get(
  "/summary",
  validate({ query: salarySummaryQuerySchema }),
  salaryController.getSalarySummary,
);

router.get(
  "/",
  validate({ query: salaryListQuerySchema }),
  salaryController.listSalaryPayments,
);

router.post(
  "/",
  validate({ body: createSalaryPaymentSchema }),
  salaryController.createSalaryPayment,
);

router.post(
  "/:id/pay",
  validate({ params: idParamSchema, body: paySalarySchema }),
  salaryController.paySalaryPayment,
);

router.post(
  "/:id/cancel",
  validate({ params: idParamSchema }),
  salaryController.cancelSalaryPayment,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  salaryController.getSalaryPayment,
);

export const salaryRoutes = router;
