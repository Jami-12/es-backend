import { PaymentMethod, PaymentStatus, Prisma, Role } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  ConfirmPaymentInput,
  FailPaymentInput,
  InitiatePaymentResult,
  PaymentResponse,
  PaymentWebhookInput,
} from "../../types/payment.types";
import type { OrderResponse } from "../../types/order.types";
import * as orderService from "../order/order.service";
import { notifyCustomerAndAdmins } from "../notification/notification-events";
import { getPaymentProvider } from "./providers";
import { verifyStripeWebhookSignature } from "./providers/card.provider";
import type {
  PaymentInitiationResult,
  PaymentProvider,
  ProviderVerificationResult,
} from "./payment-provider.types";

const paymentSelect = {
  id: true,
  orderId: true,
  method: true,
  status: true,
  amount: true,
  transactionId: true,
  providerPaymentId: true,
  providerReference: true,
  providerResponse: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

type PaymentRecord = Prisma.PaymentGetPayload<{
  select: typeof paymentSelect;
}>;

/**
 * How long a checkout initiation may hold a payment in PROCESSING without a
 * provider reference before another request is allowed to reclaim it. This
 * prevents a crashed request from permanently blocking the order.
 */
const INITIATION_CLAIM_TIMEOUT_MS = 30 * 1000;

interface PaymentClaimSnapshot {
  status: PaymentStatus;
  providerPaymentId: string | null;
  providerReference: string | null;
}

const toPaymentResponse = (payment: PaymentRecord): PaymentResponse => ({
  id: payment.id,
  orderId: payment.orderId,
  method: payment.method,
  status: payment.status,
  amount: payment.amount.toNumber(),
  transactionId: payment.transactionId,
  providerPaymentId: payment.providerPaymentId,
  providerReference: payment.providerReference,
  paidAt: payment.paidAt?.toISOString() ?? null,
  createdAt: payment.createdAt.toISOString(),
  updatedAt: payment.updatedAt.toISOString(),
});

const resolveOrderIdForPayment = async (
  paymentId: string,
): Promise<string> => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { orderId: true },
  });

  if (!payment) {
    throw ApiError.notFound("Payment not found");
  }

  return payment.orderId;
};

const loadPaymentRecord = async (
  paymentId: string,
): Promise<PaymentRecord> => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: paymentSelect,
  });

  if (!payment) {
    throw ApiError.notFound("Payment not found");
  }

  return payment;
};

const extractStoredRedirectUrl = (
  method: PaymentMethod,
  providerResponse: unknown,
): string | undefined => {
  if (
    !providerResponse ||
    typeof providerResponse !== "object" ||
    Array.isArray(providerResponse)
  ) {
    return undefined;
  }

  const data = providerResponse as Record<string, unknown>;
  const keys =
    method === PaymentMethod.BKASH
      ? ["bkashURL"]
      : method === PaymentMethod.NAGAD
        ? ["callBackUrl", "callbackUrl"]
        : [];

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

const asJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

/**
 * Keeps provider metadata monotonic. A status query often returns only the
 * transaction fields, while the create response held the redirect URL. Merging
 * preserves both so a refreshed checkout can still return the original
 * bKash/Nagad redirect URL instead of losing it on every poll.
 */
const mergeProviderResponses = (
  existing: unknown,
  incoming: Prisma.InputJsonValue | undefined,
): Prisma.InputJsonValue | undefined => {
  const existingObject = asJsonObject(existing);
  const incomingObject = asJsonObject(incoming);

  if (!existingObject) {
    return incoming;
  }

  if (!incomingObject) {
    return existing as Prisma.InputJsonValue;
  }

  return {
    ...existingObject,
    ...incomingObject,
  } as Prisma.InputJsonValue;
};

const callbackDataForStoredPayment = (
  method: PaymentMethod,
  providerPaymentId: string,
): Record<string, string> => {
  switch (method) {
    case PaymentMethod.BKASH:
      return { paymentID: providerPaymentId };
    case PaymentMethod.NAGAD:
      return { payment_ref_id: providerPaymentId };
    case PaymentMethod.CARD:
      return { paymentIntentId: providerPaymentId };
    default:
      return {};
  }
};

/**
 * Re-checks an in-flight provider session before a second checkout is created.
 * Returns a resumable response when the customer can continue, or null when
 * the previous attempt is terminal and a new session may be created.
 */
const resumeProcessingPayment = async (
  order: OrderResponse,
  provider: PaymentProvider,
  existingPayment: PaymentRecord,
): Promise<InitiatePaymentResult | null> => {
  if (!existingPayment.providerPaymentId) {
    return null;
  }

  const verification = await provider.verify(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount.toFixed(2),
      providerPaymentId: existingPayment.providerPaymentId,
    },
    callbackDataForStoredPayment(
      order.paymentMethod,
      existingPayment.providerPaymentId,
    ),
  );

  if (verification.status === "PAID") {
    await orderService.confirmPaymentForOrder(
      order.id,
      verification.transactionId,
      verification.providerReference,
      verification.providerPaymentId,
      mergeProviderResponses(
        existingPayment.providerResponse,
        verification.providerResponse,
      ),
    );

    return {
      payment: toPaymentResponse(await loadPaymentRecord(existingPayment.id)),
      method: order.paymentMethod,
      paymentStatus: PaymentStatus.PAID,
      message: "This payment has already been confirmed.",
      providerPaymentId: verification.providerPaymentId ?? null,
    };
  }

  if (verification.status === "FAILED") {
    await orderService.markPaymentFailedForOrder(
      order.id,
      verification.rawStatus ?? "Provider reported a failed payment",
    );
    return null;
  }

  if (verification.status === "CANCELLED") {
    await markPaymentCancelled(
      order.id,
      existingPayment.id,
      verification,
    );
    return null;
  }

  const processed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${order.id}::uuid FOR UPDATE`;

    const current = await tx.payment.findUnique({
      where: { id: existingPayment.id },
      select: { status: true },
    });

    if (
      !current ||
      (current.status !== PaymentStatus.PENDING &&
        current.status !== PaymentStatus.PROCESSING)
    ) {
      return false;
    }

    await tx.payment.update({
      where: { id: existingPayment.id },
      data: {
        status: PaymentStatus.PROCESSING,
        providerPaymentId:
          verification.providerPaymentId ??
          existingPayment.providerPaymentId,
        providerResponse: mergeProviderResponses(
          existingPayment.providerResponse,
          verification.providerResponse,
        ),
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.PROCESSING },
    });

    return true;
  });

  if (!processed) {
    return null;
  }

  const payment = await loadPaymentRecord(existingPayment.id);
  const redirectUrl =
    extractStoredRedirectUrl(order.paymentMethod, payment.providerResponse) ??
    extractStoredRedirectUrl(
      order.paymentMethod,
      verification.providerResponse,
    );

  return {
    payment: toPaymentResponse(payment),
    method: order.paymentMethod,
    paymentStatus: PaymentStatus.PROCESSING,
    message: redirectUrl
      ? "Resume the existing payment session"
      : verification.clientSecret
        ? "Resume the existing card payment session"
        : "A payment is already processing for this order. Please wait for the provider to confirm it.",
    redirectUrl,
    clientSecret: verification.clientSecret,
    providerPaymentId: payment.providerPaymentId,
  };
};

const claimPaymentForInitiation = async (
  orderId: string,
  paymentId: string,
): Promise<{
  claimed: boolean;
  payment: PaymentRecord;
  snapshot?: PaymentClaimSnapshot;
}> =>
  prisma.$transaction(async (tx) => {
    // Serialize two checkout requests for the same order. Holding the order
    // lock for this short transaction prevents both requests from creating a
    // provider session; the actual gateway call happens after the lock is
    // released.
    await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;

    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: paymentSelect,
    });

    if (!payment) {
      throw ApiError.notFound("Payment record not found for this order");
    }

    if (payment.status === PaymentStatus.PAID) {
      throw ApiError.conflict("This order has already been paid");
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      throw ApiError.conflict("This order payment has been refunded");
    }

    if (payment.status === PaymentStatus.PROCESSING) {
      if (payment.providerPaymentId) {
        return { claimed: false, payment };
      }

      const claimAge = Date.now() - payment.updatedAt.getTime();

      if (claimAge < INITIATION_CLAIM_TIMEOUT_MS) {
        throw ApiError.conflict(
          "A payment initiation is already in progress for this order. Please wait a moment and try again.",
        );
      }
    }

    const snapshot: PaymentClaimSnapshot = {
      status: payment.status,
      providerPaymentId: payment.providerPaymentId,
      providerReference: payment.providerReference,
    };

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PROCESSING,
        providerPaymentId: null,
        providerReference: null,
      },
      select: paymentSelect,
    });

    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: PaymentStatus.PROCESSING },
    });

    return { claimed: true, payment: updated, snapshot };
  });

const releasePaymentClaim = async (
  orderId: string,
  paymentId: string,
  snapshot: PaymentClaimSnapshot,
): Promise<void> => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;

      const current = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { status: true, providerPaymentId: true },
      });

      // A callback or webhook may have advanced the payment while the gateway
      // request was failing. Never roll back a payment that is no longer the
      // claim we created.
      if (
        !current ||
        current.status !== PaymentStatus.PROCESSING ||
        current.providerPaymentId
      ) {
        return;
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: snapshot.status,
          providerPaymentId: snapshot.providerPaymentId,
          providerReference: snapshot.providerReference,
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: snapshot.status },
      });
    });
  } catch (error) {
    console.error(
      "[payment] Failed to release a failed payment initiation claim",
      {
        orderId,
        paymentId,
        error: error instanceof Error ? error.name : "UnknownError",
      },
    );
  }
};

export const getPaymentById = async (
  requester: AuthenticatedUser,
  paymentId: string,
): Promise<PaymentResponse> => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      ...paymentSelect,
      order: { select: { userId: true } },
    },
  });

  if (!payment) {
    throw ApiError.notFound("Payment not found");
  }

  const canManageAllPayments =
    requester.role === Role.ADMIN || requester.role === Role.SUPER_ADMIN;

  if (payment.order.userId !== requester.id && !canManageAllPayments) {
    throw ApiError.notFound("Payment not found");
  }

  const { order: _order, ...paymentData } = payment;
  return toPaymentResponse(paymentData);
};

export const initiatePayment = async (
  requester: AuthenticatedUser,
  orderId: string,
  requestedMethod: PaymentRecord["method"] | undefined,
): Promise<InitiatePaymentResult> => {
  const order = await orderService.getOrderById(requester, orderId);

  if (order.userId !== requester.id) {
    throw ApiError.forbidden("You can only pay for your own orders");
  }

  if (
    order.status === "CANCELLED" ||
    order.status === "RETURNED"
  ) {
    throw ApiError.conflict("This order can no longer be paid");
  }

  if (!order.payment) {
    throw ApiError.notFound("Payment record not found for this order");
  }

  if (order.payment.status === PaymentStatus.PAID) {
    throw ApiError.conflict("This order has already been paid");
  }

  const method = requestedMethod ?? order.paymentMethod;

  if (method !== order.paymentMethod) {
    throw ApiError.badRequest(
      `This order was created with ${order.paymentMethod}. Create a new order to use a different payment method.`,
    );
  }

  if (order.paymentMethod === "CASH_ON_DELIVERY") {
    const payment = await loadPaymentRecord(order.payment.id);

    return {
      payment: toPaymentResponse(payment),
      method: order.paymentMethod,
      paymentStatus: payment.status,
      message:
        "Cash on Delivery requires no online initiation. Payment will be collected at delivery.",
      providerPaymentId: payment.providerPaymentId,
    };
  }

  const provider = getPaymentProvider(order.paymentMethod);

  if (!provider) {
    throw ApiError.badRequest(
      `Payment method ${order.paymentMethod} is not supported`,
    );
  }

  if (!provider.isConfigured()) {
    throw new ApiError(
      503,
      `${order.paymentMethod} payments are not configured on this server yet.`,
    );
  }

  const existingPayment = await loadPaymentRecord(order.payment.id);

  /**
   * bKash, Nagad and Stripe sessions are reusable while the customer is still
   * on the provider page. Re-check the existing session before creating a new
   * one so a page refresh or double click cannot leave an orphaned gateway
   * payment that could later be paid by the customer.
   */
  if (
    existingPayment.status === PaymentStatus.PROCESSING &&
    existingPayment.providerPaymentId
  ) {
    const resumed = await resumeProcessingPayment(
      order,
      provider,
      existingPayment,
    );

    if (resumed) {
      return resumed;
    }
  }

  const claim = await claimPaymentForInitiation(
    order.id,
    existingPayment.id,
  );

  if (!claim.claimed) {
    if (claim.payment.providerPaymentId) {
      const resumed = await resumeProcessingPayment(
        order,
        provider,
        claim.payment,
      );

      if (resumed) {
        return resumed;
      }
    }

    throw ApiError.conflict(
      "A payment is already being initiated for this order. Please wait a moment and try again.",
    );
  }

  let initiation: PaymentInitiationResult;

  try {
    initiation = await provider.initiate(order);
  } catch (error) {
    if (claim.snapshot) {
      await releasePaymentClaim(
        order.id,
        existingPayment.id,
        claim.snapshot,
      );
    }

    throw error;
  }

  const initiatingPaymentId = order.payment.id;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: initiatingPaymentId },
      data: {
        method: order.paymentMethod,
        status: initiation.paymentStatus,
        providerPaymentId: initiation.providerPaymentId ?? null,
        providerReference: initiation.providerReference ?? null,
        providerResponse: initiation.providerResponse,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: initiation.paymentStatus },
    });

    // Notify once when an order actually moves into PROCESSING. Retries that
    // merely resume an existing gateway session must not duplicate the alert.
    if (
      initiation.paymentStatus === PaymentStatus.PROCESSING &&
      claim.snapshot?.status !== PaymentStatus.PROCESSING
    ) {
      await notifyCustomerAndAdmins(tx, {
        customerId: order.userId,
        title: "Payment processing",
        message: `Payment for order ${order.orderNumber} is being processed.`,
        type: "ORDER",
        adminMessage: `Payment for order ${order.orderNumber} is processing with ${order.paymentMethod}.`,
        orderId: order.id,
      });
    }
  });

  const payment = await loadPaymentRecord(order.payment.id);

  return {
    payment: toPaymentResponse(payment),
    method: initiation.method,
    paymentStatus: initiation.paymentStatus,
    message: initiation.message,
    redirectUrl: initiation.redirectUrl,
    clientSecret: initiation.clientSecret,
    providerPaymentId: initiation.providerPaymentId ?? null,
  };
};

const findPaymentForCallback = async (
  callbackData: Record<string, string>,
): Promise<PaymentRecord & { orderId: string }> => {
  const orderId =
    callbackData.orderId?.trim() ||
    callbackData.order_id?.trim() ||
    callbackData.orderID?.trim() ||
    callbackData.merchantOrderId?.trim();
  const providerPaymentId =
    callbackData.paymentID?.trim() ||
    callbackData.payment_ref_id?.trim() ||
    callbackData.paymentReferenceId?.trim() ||
    callbackData.paymentIntentId?.trim();

  if (!orderId && !providerPaymentId) {
    throw ApiError.badRequest(
      "Provider callback is missing both orderId and payment reference",
    );
  }

  const payment = orderId
    ? await prisma.payment.findUnique({
        where: { orderId },
        select: paymentSelect,
      })
    : providerPaymentId
      ? await prisma.payment.findFirst({
          where: { providerPaymentId },
          select: paymentSelect,
        })
      : null;

  if (!payment) {
    throw ApiError.notFound("Payment not found for this provider callback");
  }

  if (!payment.providerPaymentId) {
    throw ApiError.badRequest(
      "Payment was not initiated with a provider reference for this order",
    );
  }

  if (
    providerPaymentId &&
    providerPaymentId !== payment.providerPaymentId
  ) {
    throw ApiError.badRequest(
      "Provider payment reference does not match this order",
    );
  }

  return payment;
};

const markPaymentCancelled = async (
  orderId: string,
  paymentId: string,
  verification: ProviderVerificationResult,
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    // Serialize cancellation with payment confirmation. Without this lock a
    // late cancellation callback could overwrite a payment that another
    // callback has just verified as PAID.
    await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;

    const current = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { status: true },
    });

    // Cancellation can be delivered more than once by provider retries. A
    // terminal state must not create duplicate notifications or overwrite a
    // refunded payment.
    if (
      !current ||
      current.status === PaymentStatus.CANCELLED ||
      current.status === PaymentStatus.REFUNDED
    ) {
      return;
    }

    if (current.status === PaymentStatus.PAID) {
      throw ApiError.conflict(
        "Completed payments cannot be marked as cancelled",
      );
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.CANCELLED,
        providerPaymentId:
          verification.providerPaymentId ?? undefined,
        providerResponse: verification.providerResponse,
      },
    });

    const order = await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: PaymentStatus.CANCELLED },
      select: { orderNumber: true, userId: true },
    });

    await notifyCustomerAndAdmins(tx, {
      customerId: order.userId,
      title: "Payment cancelled",
      message: `Payment for order ${order.orderNumber} was cancelled. You can retry payment from your order.`,
      type: "ORDER",
      adminMessage: `Payment for order ${order.orderNumber} was cancelled.`,
      orderId,
    });
  });
};

export const handleProviderCallback = async (
  callbackData: Record<string, string>,
): Promise<PaymentResponse> => {
  const payment = await findPaymentForCallback(callbackData);
  const provider = getPaymentProvider(payment.method);

  if (!provider) {
    throw ApiError.badRequest(
      `No payment provider is registered for ${payment.method}`,
    );
  }

  if (
    payment.status === PaymentStatus.PAID ||
    payment.status === PaymentStatus.REFUNDED
  ) {
    return toPaymentResponse(payment);
  }

  const order = await prisma.order.findUnique({
    where: { id: payment.orderId },
    select: { orderNumber: true, totalAmount: true },
  });

  if (!order) {
    throw ApiError.notFound("Order not found for this payment");
  }

  const verification = await provider.verify(
    {
      orderId: payment.orderId,
      orderNumber: order.orderNumber,
      amount: order.totalAmount.toFixed(2),
      providerPaymentId: payment.providerPaymentId,
    },
    callbackData,
  );

  if (verification.status === "PAID") {
    await orderService.confirmPaymentForOrder(
      payment.orderId,
      verification.transactionId,
      verification.providerReference,
      verification.providerPaymentId,
      mergeProviderResponses(
        payment.providerResponse,
        verification.providerResponse,
      ),
    );
  } else if (verification.status === "FAILED") {
    await orderService.markPaymentFailedForOrder(
      payment.orderId,
      verification.rawStatus ?? "Provider reported a failed payment",
    );
  } else if (verification.status === "CANCELLED") {
    await markPaymentCancelled(payment.orderId, payment.id, verification);
  } else {
    await prisma.$transaction(async (tx) => {
      // A provider can retry callbacks. Never let a stale "still pending"
      // response overwrite a terminal payment state set by another callback.
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${payment.orderId}::uuid FOR UPDATE`;

      const current = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });

      if (
        !current ||
        (current.status !== PaymentStatus.PENDING &&
          current.status !== PaymentStatus.PROCESSING)
      ) {
        return;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PROCESSING,
          providerPaymentId:
            verification.providerPaymentId ?? payment.providerPaymentId,
          providerResponse: mergeProviderResponses(
            payment.providerResponse,
            verification.providerResponse,
          ),
        },
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: PaymentStatus.PROCESSING },
      });
    });
  }

  return toPaymentResponse(await loadPaymentRecord(payment.id));
};

/**
 * Webhook-independent card reconciliation. Stripe Elements can confirm a
 * payment before (or even without) the webhook reaching the server. The
 * customer's authenticated browser calls this endpoint after confirmation so
 * the order is verified against Stripe immediately. Repeated calls are safe.
 */
export const reconcileCardPayment = async (
  requester: AuthenticatedUser,
  orderId: string,
): Promise<PaymentResponse> => {
  const order = await orderService.getOrderById(requester, orderId);

  if (order.paymentMethod !== PaymentMethod.CARD) {
    throw ApiError.badRequest("This order was not created with card payment");
  }

  if (!order.payment) {
    throw ApiError.notFound("Payment record not found for this order");
  }

  const payment = await loadPaymentRecord(order.payment.id);

  if (payment.status === PaymentStatus.PAID) {
    return toPaymentResponse(payment);
  }

  if (!payment.providerPaymentId) {
    throw ApiError.conflict(
      "Card payment has not been initiated for this order yet",
    );
  }

  await handleProviderCallback({
    orderId: order.id,
    paymentIntentId: payment.providerPaymentId,
  });

  return toPaymentResponse(await loadPaymentRecord(payment.id));
};

export const handleCardWebhook = async (
  rawPayload: Buffer,
  signature: string | undefined,
): Promise<{ processed: boolean; payment: PaymentResponse | null }> => {
  const event = verifyStripeWebhookSignature(rawPayload, signature);
  const object = event.data.object;
  const metadata =
    typeof object.metadata === "object" && object.metadata !== null
      ? (object.metadata as Record<string, unknown>)
      : {};
  const orderId =
    typeof metadata.orderId === "string" ? metadata.orderId : undefined;
  const intentId = typeof object.id === "string" ? object.id : undefined;

  if (!orderId) {
    return { processed: false, payment: null };
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId },
    select: paymentSelect,
  });

  if (!payment) {
    return { processed: false, payment: null };
  }

  if (!payment.providerPaymentId || !intentId) {
    return { processed: false, payment: null };
  }

  if (payment.providerPaymentId !== intentId) {
    throw ApiError.badRequest(
      "Card webhook payment intent does not match this order",
    );
  }

  if (payment.status === PaymentStatus.PAID) {
    return { processed: true, payment: toPaymentResponse(payment) };
  }

  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.processing"
  ) {
    const updated = await handleProviderCallback({
      orderId,
      paymentIntentId: intentId ?? "",
    });

    return { processed: true, payment: updated };
  }

  if (
    event.type === "payment_intent.payment_failed" ||
    event.type === "payment_intent.canceled"
  ) {
    /**
     * Stripe retries webhooks and can deliver both failed and canceled events
     * for the same intent. Do not emit duplicate notifications or overwrite a
     * terminal state.
     */
    if (
      payment.status === PaymentStatus.FAILED ||
      payment.status === PaymentStatus.CANCELLED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return { processed: true, payment: toPaymentResponse(payment) };
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, totalAmount: true, userId: true },
    });

    if (!order) {
      return { processed: false, payment: null };
    }

    const provider = getPaymentProvider(payment.method);

    if (!provider) {
      return { processed: false, payment: null };
    }

    // A webhook signature proves the event is authentic, but it does not prove
    // ordering. Fetch the intent before writing a terminal failure so a late
    // "failed" event can never overwrite an intent that actually succeeded.
    const verification = await provider.verify(
      {
        orderId,
        orderNumber: order.orderNumber,
        amount: order.totalAmount.toFixed(2),
        providerPaymentId: intentId,
      },
      { paymentIntentId: intentId },
    );

    if (verification.status === "PAID") {
      await orderService.confirmPaymentForOrder(
        orderId,
        verification.transactionId,
        verification.providerReference,
        verification.providerPaymentId,
        mergeProviderResponses(
          payment.providerResponse,
          verification.providerResponse,
        ),
      );

      return {
        processed: true,
        payment: toPaymentResponse(await loadPaymentRecord(payment.id)),
      };
    }

    if (verification.status === "CANCELLED") {
      await markPaymentCancelled(orderId, payment.id, verification);

      return {
        processed: true,
        payment: toPaymentResponse(await loadPaymentRecord(payment.id)),
      };
    }

    const reason =
      typeof object.last_payment_error === "object" &&
      object.last_payment_error !== null
        ? String(
            (object.last_payment_error as Record<string, unknown>).message ??
              event.type,
          )
        : event.type;
    const nextStatus =
      event.type === "payment_intent.canceled"
        ? PaymentStatus.CANCELLED
        : PaymentStatus.FAILED;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;

      const current = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });

      if (
        !current ||
        current.status === PaymentStatus.PAID ||
        current.status === PaymentStatus.FAILED ||
        current.status === PaymentStatus.CANCELLED ||
        current.status === PaymentStatus.REFUNDED
      ) {
        return;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          providerPaymentId: intentId ?? payment.providerPaymentId,
          providerResponse: JSON.parse(JSON.stringify(event)),
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: nextStatus },
      });

      await notifyCustomerAndAdmins(tx, {
        customerId: order.userId,
        title:
          nextStatus === PaymentStatus.CANCELLED
            ? "Card payment cancelled"
            : "Card payment failed",
        message: `Card payment for order ${order.orderNumber} ${
          nextStatus === PaymentStatus.CANCELLED ? "was cancelled" : "failed"
        }: ${reason}`,
        type: "ORDER",
        adminMessage: `Card payment for order ${order.orderNumber} ${
          nextStatus === PaymentStatus.CANCELLED ? "was cancelled" : "failed"
        }: ${reason}`,
        orderId,
      });
    });

    return {
      processed: true,
      payment: toPaymentResponse(await loadPaymentRecord(payment.id)),
    };
  }

  return { processed: false, payment: null };
};

export const confirmPayment = async (
  actor: AuthenticatedUser,
  paymentId: string,
  input: ConfirmPaymentInput,
  ipAddress?: string,
): Promise<PaymentResponse> => {
  const orderId = await resolveOrderIdForPayment(paymentId);
  const order = await orderService.confirmPaymentForOrder(
    orderId,
    input.transactionId,
    input.providerReference,
  );

  await recordAudit({
    userId: actor.id,
    action: "CONFIRM_PAYMENT",
    entity: "Payment",
    entityId: order.payment?.id,
    description: `Confirmed payment for order ${order.orderNumber}`,
    newData: {
      orderId: order.id,
      transactionId: order.payment?.transactionId,
      status: order.payment?.status,
    },
    ipAddress,
  });

  return toPaymentResponse(await loadPaymentRecord(paymentId));
};

export const failPayment = async (
  actor: AuthenticatedUser,
  paymentId: string,
  input: FailPaymentInput,
  ipAddress?: string,
): Promise<PaymentResponse> => {
  const orderId = await resolveOrderIdForPayment(paymentId);
  const order = await orderService.markPaymentFailedForOrder(
    orderId,
    input.reason,
  );

  await recordAudit({
    userId: actor.id,
    action: "FAIL_PAYMENT",
    entity: "Payment",
    entityId: order.payment?.id,
    description: `Marked payment as failed for order ${order.orderNumber}`,
    newData: { orderId: order.id, status: PaymentStatus.FAILED },
    ipAddress,
  });

  return toPaymentResponse(await loadPaymentRecord(paymentId));
};

export const handleProviderWebhook = async (
  secret: string | undefined,
  input: PaymentWebhookInput,
): Promise<PaymentResponse> => {
  if (!env.PAYMENT_WEBHOOK_SECRET) {
    throw new ApiError(
      503,
      "Payment webhook is not configured on this server",
    );
  }

  if (!secret || secret !== env.PAYMENT_WEBHOOK_SECRET) {
    throw ApiError.unauthorized("Invalid payment webhook signature");
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId: input.orderId },
    select: { providerPaymentId: true },
  });

  if (!payment) {
    throw ApiError.notFound("Payment not found");
  }

  if (!payment.providerPaymentId) {
    throw ApiError.badRequest(
      "Payment was not initiated with a provider reference",
    );
  }

  /**
   * The webhook body is authenticated by the shared secret, but the caller is
   * still not allowed to declare a payment successful. Resolve the
   * authoritative status from the gateway, exactly like a provider callback.
   * The input status is intentionally not trusted.
   */
  return handleProviderCallback({
    orderId: input.orderId,
    paymentID: payment.providerPaymentId,
    paymentReferenceId: payment.providerPaymentId,
    paymentIntentId: payment.providerPaymentId,
  });
};
