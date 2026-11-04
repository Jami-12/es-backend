import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  dailyReportQuerySchema,
  dateRangeQuerySchema,
  monthlyReportQuerySchema,
  reportQuerySchema,
  transactionListQuerySchema,
  yearlyReportQuerySchema,
} from "../../validations/accounting.validation";
import * as accountingController from "./accounting.controller";

const router = Router();

router.use(authenticate);
router.use(authorize([Role.SUPER_ADMIN]));

router.get("/dashboard", accountingController.getDashboard);

router.get(
  "/summary",
  validate({ query: dateRangeQuerySchema }),
  accountingController.getFinancialSummary,
);

router.get(
  "/reports",
  validate({ query: reportQuerySchema }),
  accountingController.getFinancialReport,
);

router.get(
  "/reports/daily",
  validate({ query: dailyReportQuerySchema }),
  accountingController.getDailyReport,
);

router.get(
  "/reports/monthly",
  validate({ query: monthlyReportQuerySchema }),
  accountingController.getMonthlyReport,
);

router.get(
  "/reports/yearly",
  validate({ query: yearlyReportQuerySchema }),
  accountingController.getYearlyReport,
);

router.get(
  "/reports/orders",
  validate({ query: dateRangeQuerySchema }),
  accountingController.getProfitByOrder,
);

router.get(
  "/transactions",
  validate({ query: transactionListQuerySchema }),
  accountingController.listTransactions,
);

export const accountingRoutes = router;
