import type { CashCollectionListQuery } from "../../types/order.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as orderService from "./order.service";

export const listCashCollections = asyncHandler(async (req, res) => {
  const result = await orderService.listCashCollections(
    req.query as unknown as CashCollectionListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Cash collection entries retrieved successfully",
  });
});

export const collectCash = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const entry = await orderService.collectCashForOrder(
    user,
    req.params.id,
    req.ip,
  );

  sendSuccess(res, {
    data: { entry },
    message: `Cash collected for order ${entry.orderNumber}`,
  });
});
