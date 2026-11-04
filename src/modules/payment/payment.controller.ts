import type {
  ConfirmPaymentInput,
  FailPaymentInput,
  InitiatePaymentInput,
  PaymentWebhookInput,
} from "../../types/payment.types";
import { env } from "../../config/env";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import { paymentProviderStatus } from "../../config/payment.config";
import * as paymentService from "./payment.service";

const toFlatStringRecord = (value: unknown): Record<string, string> => {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, string>
  >((accumulator, [key, entry]) => {
    if (typeof entry === "string") {
      accumulator[key] = entry;
    } else if (Array.isArray(entry) && typeof entry[0] === "string") {
      accumulator[key] = entry[0];
    }
    return accumulator;
  }, {});
};

export const getProviderStatus = asyncHandler(async (_req, res) => {
  sendSuccess(res, {
    data: { providers: paymentProviderStatus() },
    message: "Payment provider configuration retrieved successfully",
  });
});

export const initiatePayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const input = req.body as InitiatePaymentInput;
  const result = await paymentService.initiatePayment(
    user,
    input.orderId,
    input.method,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: result,
    message: result.message,
  });
});

export const providerCallback = asyncHandler(async (req, res) => {
  const callbackData = {
    ...toFlatStringRecord(req.query),
    ...toFlatStringRecord(req.body),
  };

  const payment = await paymentService.handleProviderCallback(callbackData);

  const wantsJson =
    req.method === "POST" ||
    req.query.redirect === "false" ||
    (req.headers.accept ?? "").includes("application/json");

  if (wantsJson) {
    sendSuccess(res, {
      data: { payment },
      message: "Payment callback processed successfully",
    });
    return;
  }

  const redirectUrl = new URL(
    `/dashboard/orders/${payment.orderId}`,
    env.CLIENT_URL.replace(/\/+$/, ""),
  );
  redirectUrl.searchParams.set("paymentStatus", payment.status);

  res.redirect(redirectUrl.toString());
});

export const cardWebhook = asyncHandler(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body ?? {}));

  const result = await paymentService.handleCardWebhook(
    rawBody,
    req.header("stripe-signature"),
  );

  sendSuccess(res, {
    data: result,
    message: result.processed
      ? "Card webhook processed successfully"
      : "Card webhook ignored",
  });
});

export const reconcileCardPayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { orderId } = req.body as { orderId: string };
  const payment = await paymentService.reconcileCardPayment(user, orderId);

  sendSuccess(res, {
    data: { payment },
    message: "Card payment status reconciled successfully",
  });
});

export const getPayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const payment = await paymentService.getPaymentById(user, req.params.id);

  sendSuccess(res, {
    data: { payment },
    message: "Payment retrieved successfully",
  });
});

export const confirmPayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const payment = await paymentService.confirmPayment(
    user,
    req.params.id,
    req.body as ConfirmPaymentInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { payment },
    message: "Payment confirmed successfully",
  });
});

export const failPayment = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const payment = await paymentService.failPayment(
    user,
    req.params.id,
    req.body as FailPaymentInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { payment },
    message: "Payment marked as failed",
  });
});

export const providerWebhook = asyncHandler(async (req, res) => {
  const secret = req.header("x-webhook-secret");
  const payment = await paymentService.handleProviderWebhook(
    secret,
    req.body as PaymentWebhookInput,
  );

  sendSuccess(res, {
    data: { payment },
    message: "Payment webhook processed successfully",
  });
});
