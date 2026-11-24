import type {
  CheckoutInput,
  CollectCodPaymentInput,
  OrderListQuery,
  OrderTrackingQuery,
  UpdateOrderStatusInput,
} from "../../types/order.types";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as orderService from "./order.service";

export const trackOrder = asyncHandler(async (req, res) => {
  const { code } = req.query as unknown as OrderTrackingQuery;
  const tracking = await orderService.trackOrder(code);

  sendSuccess(res, {
    data: { tracking },
    message: "Order status retrieved successfully",
  });
});

export const checkout = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const order = await orderService.checkout(
    user.id,
    req.body as CheckoutInput,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { order },
    message: "Order placed successfully. Complete payment to confirm it.",
  });
});

export const guestCheckout = asyncHandler(async (req, res) => {
  const order = await orderService.checkout(null, req.body as CheckoutInput);

  sendSuccess(res, {
    statusCode: 201,
    data: { order },
    message: "Order placed successfully. Complete payment to confirm it.",
  });
});

const guestTokenFromRequest = (req: { query: unknown }): string => {
  const { guestToken } = req.query as { guestToken?: unknown };
  if (typeof guestToken !== "string" || guestToken.trim().length === 0) {
    throw ApiError.badRequest("A guest order token is required");
  }
  return guestToken.trim();
};

export const getGuestOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getGuestOrderById(
    req.params.id,
    guestTokenFromRequest(req),
  );

  sendSuccess(res, {
    data: { order },
    message: "Order retrieved successfully",
  });
});

export const getGuestOrderReceipt = asyncHandler(async (req, res) => {
  const receipt = await orderService.getGuestOrderReceipt(
    req.params.id,
    guestTokenFromRequest(req),
  );

  sendSuccess(res, {
    data: { receipt },
    message: "Order receipt generated successfully",
  });
});

export const listMyOrders = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await orderService.listOrders(
    user,
    req.query as unknown as OrderListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Orders retrieved successfully",
  });
});

export const listOrders = listMyOrders;

export const getOrder = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const order = await orderService.getOrderById(user, req.params.id);

  sendSuccess(res, {
    data: { order },
    message: "Order retrieved successfully",
  });
});

export const getOrderReceipt = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const receipt = await orderService.getOrderReceipt(user, req.params.id);

  sendSuccess(res, {
    data: { receipt },
    message: "Order receipt generated successfully",
  });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const order = await orderService.cancelOrder(user.id, req.params.id);

  sendSuccess(res, {
    data: { order },
    message: "Order cancelled successfully",
  });
});

export const adminListOrders = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await orderService.listOrders(
    user,
    req.query as unknown as OrderListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Orders retrieved successfully",
  });
});

export const adminUpdateOrderStatus = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const order = await orderService.updateOrderStatus(
    user,
    req.params.id,
    req.body as UpdateOrderStatusInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { order },
    message: "Order status updated successfully",
  });
});

export const adminCollectCodPayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const order = await orderService.collectCashOnDeliveryPayment(
    user,
    req.params.id,
    req.body as CollectCodPaymentInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { order },
    message: "Cash on delivery collected and payment marked as paid",
  });
});
