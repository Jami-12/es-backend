import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { billListQuerySchema } from "../../validations/expense.validation";
import { dateRangeQuerySchema } from "../../validations/accounting.validation";
import * as accountingController from "../accounting/accounting.controller";
import * as employeeController from "../employee/employee.controller";
import * as expenseController from "../expense/expense.controller";
import * as inventoryController from "../inventory/inventory.controller";
import * as analyticsController from "./analytics.controller";

const router = Router();

router.use(authenticate, authorize([Role.SUPER_ADMIN]));

router.get("/overview", analyticsController.getOverview);
router.get("/revenue", analyticsController.getRevenue);
router.get("/payments", analyticsController.getPayments);
router.get("/orders", analyticsController.getOrders);

router.get("/dashboard", accountingController.getDashboard);
router.get("/inventory", inventoryController.getInventoryOverview);
router.get("/employees", employeeController.getEmployeeSummary);
router.get(
  "/bills",
  validate({ query: billListQuerySchema }),
  expenseController.listBills,
);
router.get(
  "/profit-loss",
  validate({ query: dateRangeQuerySchema }),
  accountingController.getFinancialSummary,
);

export const analyticsRoutes = router;
