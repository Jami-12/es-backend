import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  billListQuerySchema,
  createExpenseSchema,
  expenseListQuerySchema,
  updateExpenseSchema,
} from "../../validations/expense.validation";
import * as expenseController from "./expense.controller";

const router = Router();

router.use(authenticate);
router.use(authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.get(
  "/bills",
  validate({ query: billListQuerySchema }),
  expenseController.listBills,
);

router.get("/summary", expenseController.getExpenseSummary);

router.get(
  "/",
  validate({ query: expenseListQuerySchema }),
  expenseController.listExpenses,
);

router.post(
  "/",
  validate({ body: createExpenseSchema }),
  expenseController.createExpense,
);

router.get(
  "/:id",
  validate({ params: idParamSchema }),
  expenseController.getExpense,
);

router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateExpenseSchema }),
  expenseController.updateExpense,
);

router.delete(
  "/:id",
  validate({ params: idParamSchema }),
  expenseController.cancelExpense,
);

export const expenseRoutes = router;
