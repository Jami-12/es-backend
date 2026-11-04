import type {
  CheckoutInput,
  OrderListQuery,
  UpdateOrderStatusInput,
} from "../../types/order.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as orderService from "./order.service";

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
