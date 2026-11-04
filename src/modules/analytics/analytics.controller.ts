import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/ApiResponse";
import * as analyticsService from "./analytics.service";

export const getOverview = asyncHandler(async (_req, res) => {
  const overview = await analyticsService.getAnalyticsOverview();

  sendSuccess(res, {
    data: { overview },
    message: "Analytics overview retrieved successfully",
  });
});

export const getRevenue = asyncHandler(async (_req, res) => {
  const revenue = await analyticsService.getRevenueAnalytics();

  sendSuccess(res, {
    data: { revenue },
    message: "Revenue analytics retrieved successfully",
  });
});

export const getPayments = asyncHandler(async (_req, res) => {
  const payments = await analyticsService.getPaymentAnalytics();

  sendSuccess(res, {
    data: { payments },
    message: "Payment analytics retrieved successfully",
  });
});

export const getOrders = asyncHandler(async (_req, res) => {
  const orders = await analyticsService.getOrderAnalytics();

  sendSuccess(res, {
    data: { orders },
    message: "Order analytics retrieved successfully",
  });
});
