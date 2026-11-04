import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  createInvestmentSchema,
  investmentListQuerySchema,
  updateInvestmentSchema,
} from "../../validations/investment.validation";
import * as investmentController from "./investment.controller";

const router = Router();

router.use(authenticate);
router.use(authorize([Role.SUPER_ADMIN]));

router.get("/summary", investmentController.getInvestmentSummary);

router.get(
  "/",
  validate({ query: investmentListQuerySchema }),
  investmentController.listInvestments,
);

router.post(
  "/",
  validate({ body: createInvestmentSchema }),
  investmentController.createInvestment,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  investmentController.getInvestment,
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateInvestmentSchema }),
  investmentController.updateInvestment,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  investmentController.deleteInvestment,
);

export const investmentRoutes = router;
