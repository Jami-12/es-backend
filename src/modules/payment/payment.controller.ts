import { PaymentMethod } from "@prisma/client";
import type {
  ConfirmPaymentInput,
  FailPaymentInput,
  InitiatePaymentInput,
  PaymentWebhookInput,
} from "../../types/payment.types";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { bkashConfig, isNagadSimulationEnabled } from "../../config/payment.config";
import { ApiError } from "../../utils/ApiError";
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

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

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

export const createBkashPayment = asyncHandler(async (req, res) => {
  const orderId = (req.body?.orderId || req.query?.orderId) as string | undefined;
  if (!orderId) {
    throw ApiError.badRequest("orderId is required");
  }

  // Validate sandbox credentials from .env
  if (
    !bkashConfig.appKey ||
    !bkashConfig.appSecret ||
    !bkashConfig.username ||
    !bkashConfig.password ||
    !bkashConfig.baseUrl
  ) {
    throw new ApiError(
      503,
      "bKash is not configured. Verify BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, and BKASH_PASSWORD in .env",
    );
  }

  let actor = req.user;
  if (!actor) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });
    if (!order) {
      throw ApiError.notFound("Order not found");
    }
    actor = {
      id: order.user.id,
      email: order.user.email,
      name: order.user.name,
      role: order.user.role,
      status: order.user.status,
    };
  }

  const result = await paymentService.initiatePayment(
    actor,
    orderId,
    PaymentMethod.BKASH,
  );

  const bkashUrl = result.redirectUrl;

  if (
    req.query.redirect === "true" ||
    (req.headers.accept && req.headers.accept.includes("text/html"))
  ) {
    if (bkashUrl) {
      res.redirect(bkashUrl);
      return;
    }
  }

  sendSuccess(res, {
    statusCode: 201,
    data: {
      ...result,
      bkashURL: bkashUrl,
    },
    message: result.message || "bKash checkout URL created successfully",
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

/**
 * Renders the dev-only Nagad checkout simulator. It is only reachable while
 * NAGAD_SIMULATION is enabled outside production, and mimics the redirect page
 * a real Nagad session would show so the callback/verify flow can be tested
 * locally. Approving or cancelling simply redirects to the real Nagad callback
 * endpoint with the same query parameters Nagad would send.
 */
export const nagadSimulationPage = asyncHandler(async (req, res) => {
  if (!isNagadSimulationEnabled()) {
    throw ApiError.notFound("Not found");
  }

  const orderId = String(req.query.orderId ?? "").trim();
  const reference = String(req.query.ref ?? "").trim();
  const orderNumber = String(req.query.orderNumber ?? "").trim();
  const amount = String(req.query.amount ?? "").trim();

  if (!orderId || !reference) {
    throw ApiError.badRequest("orderId and ref are required");
  }

  const callbackBase = `${env.PUBLIC_BASE_URL.replace(/\/+$/, "")}/api/v1/payments/nagad/callback`;
  const approveUrl = `${callbackBase}?order_id=${encodeURIComponent(orderId)}&payment_ref_id=${encodeURIComponent(reference)}&status=Success`;
  const cancelUrl = `${callbackBase}?order_id=${encodeURIComponent(orderId)}&payment_ref_id=${encodeURIComponent(reference)}&status=Aborted`;

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Nagad Sandbox (Simulation)</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #f4f6f8; color: #172b3a; padding: 20px; }
  .card { width: 100%; max-width: 400px; background: #fff; border-radius: 20px; overflow: hidden;
    box-shadow: 0 24px 60px rgba(16, 36, 52, 0.18); }
  .banner { background: #e2136e; color: #fff; padding: 20px 24px; }
  .banner small { display: block; text-transform: uppercase; letter-spacing: .18em;
    font-size: 10px; opacity: .85; margin-bottom: 4px; }
  .banner h1 { margin: 0; font-size: 20px; }
  .body { padding: 24px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0;
    border-bottom: 1px solid #eef1f4; font-size: 14px; }
  .row:last-of-type { border-bottom: 0; }
  .row span:first-child { color: #64748b; }
  .row span:last-child { font-weight: 600; text-align: right; word-break: break-all; }
  .actions { margin-top: 20px; display: grid; gap: 10px; }
  a.btn { display: block; text-align: center; padding: 14px; border-radius: 12px;
    font-weight: 700; text-decoration: none; font-size: 15px; }
  a.pay { background: #e2136e; color: #fff; }
  a.cancel { background: #eef1f4; color: #334155; }
  .note { margin-top: 16px; font-size: 11px; line-height: 1.6; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <div class="banner">
      <small>Simulation · not a real payment</small>
      <h1>Nagad Sandbox</h1>
    </div>
    <div class="body">
      <div class="row"><span>Order</span><span>${escapeHtml(orderNumber || orderId)}</span></div>
      <div class="row"><span>Amount</span><span>BDT ${escapeHtml(amount || "0.00")}</span></div>
      <div class="row"><span>Reference</span><span>${escapeHtml(reference)}</span></div>
      <div class="actions">
        <a class="btn pay" href="${escapeHtml(approveUrl)}">Approve payment</a>
        <a class="btn cancel" href="${escapeHtml(cancelUrl)}">Cancel payment</a>
      </div>
      <p class="note">This page only exists while <code>NAGAD_SIMULATION=true</code> in a non-production environment.</p>
    </div>
  </div>
</body>
</html>`);
});
