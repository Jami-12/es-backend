import type {
  DateRangeQuery,
  TransactionListQuery,
} from "../../types/accounting.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as accountingService from "./accounting.service";

export const getDashboard = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const dashboard = await accountingService.getDashboardOverview(user);

  sendSuccess(res, {
    data: { dashboard },
    message: "Accounting dashboard retrieved successfully",
  });
});

export const getFinancialSummary = asyncHandler(async (req, res) => {
  const query = req.query as unknown as DateRangeQuery;
  const summary = await accountingService.getFinancialSummary(
    query.startDate,
    query.endDate,
  );

  sendSuccess(res, {
    data: { summary },
    message: "Financial summary retrieved successfully",
  });
});

export const getFinancialReport = asyncHandler(async (req, res) => {
  const query = req.query as unknown as DateRangeQuery & {
    granularity?: "day" | "month";
  };
  const report = await accountingService.getFinancialReport(
    query.startDate,
    query.endDate,
    query.granularity,
  );

  sendSuccess(res, {
    data: { report },
    message: "Financial report retrieved successfully",
  });
});

export const getDailyReport = asyncHandler(async (req, res) => {
  const query = req.query as unknown as { date?: Date };
  const report = await accountingService.getDailyReport(query.date);

  sendSuccess(res, {
    data: { report },
    message: "Daily report retrieved successfully",
  });
});

export const getMonthlyReport = asyncHandler(async (req, res) => {
  const query = req.query as unknown as { year: number; month: number };
  const report = await accountingService.getMonthlyReport(
    query.year,
    query.month,
  );

  sendSuccess(res, {
    data: { report },
    message: "Monthly report retrieved successfully",
  });
});

export const getYearlyReport = asyncHandler(async (req, res) => {
  const query = req.query as unknown as { year: number };
  const report = await accountingService.getYearlyReport(query.year);

  sendSuccess(res, {
    data: { report },
    message: "Yearly report retrieved successfully",
  });
});

export const listTransactions = asyncHandler(async (req, res) => {
  const result = await accountingService.listTransactions(
    req.query as unknown as TransactionListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Financial transactions retrieved successfully",
  });
});

export const getProfitByOrder = asyncHandler(async (req, res) => {
  const query = req.query as unknown as DateRangeQuery;
  const result = await accountingService.getOrderProfitReport(
    query.startDate,
    query.endDate,
  );

  sendSuccess(res, {
    data: result,
    message: "Order profit report retrieved successfully",
  });
});
