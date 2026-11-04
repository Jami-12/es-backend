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
import * as orderService from "../order/order.service";
import { getPaymentProvider } from "./providers";
import { verifyStripeWebhookSignature } from "./providers/card.provider";
import type { ProviderVerificationResult } from "./payment-provider.types";

const paymentSelect = {
  id: true,
  orderId: true,
  method: true,
  status: true,
  amount: true,
  transactionId: true,
  providerPaymentId: true,
  providerReference: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

type PaymentRecord = Prisma.PaymentGetPayload<{
  select: typeof paymentSelect;
}>;

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
   * Stripe PaymentIntents are reusable while they are still awaiting customer
   * action. Reuse the existing intent instead of creating a second one every
   * time the customer refreshes or retries the card page.
   */
  if (
    order.paymentMethod === PaymentMethod.CARD &&
    existingPayment.status === PaymentStatus.PROCESSING &&
    existingPayment.providerPaymentId
  ) {
    const verification = await provider.verify(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount.toFixed(2),
        providerPaymentId: existingPayment.providerPaymentId,
      },
      { paymentIntentId: existingPayment.providerPaymentId },
    );

    if (verification.status === "PAID") {
      await orderService.confirmPaymentForOrder(
        order.id,
        verification.transactionId,
        verification.providerReference,
        verification.providerPaymentId,
        verification.providerResponse,
      );

      return {
        payment: toPaymentResponse(await loadPaymentRecord(order.payment.id)),
        method: PaymentMethod.CARD,
        paymentStatus: PaymentStatus.PAID,
        message: "This card payment has already been confirmed.",
        providerPaymentId: verification.providerPaymentId ?? null,
      };
    }

    if (verification.status === "PENDING") {
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.PROCESSING,
            providerPaymentId:
              verification.providerPaymentId ??
              existingPayment.providerPaymentId,
            providerResponse: verification.providerResponse,
          },
        }),
        prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.PROCESSING },
        }),
      ]);

      const payment = await loadPaymentRecord(existingPayment.id);

      return {
        payment: toPaymentResponse(payment),
        method: PaymentMethod.CARD,
        paymentStatus: PaymentStatus.PROCESSING,
        message: verification.clientSecret
          ? "Resume the existing card payment session"
          : "A card payment is already processing for this order. Please wait for the provider to confirm it.",
        clientSecret: verification.clientSecret,
        providerPaymentId: payment.providerPaymentId,
      };
    }
  }

  const initiation = await provider.initiate(order);

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        method: order.paymentMethod,
        status: initiation.paymentStatus,
        providerPaymentId: initiation.providerPaymentId ?? null,
        providerReference: initiation.providerReference ?? null,
        providerResponse: initiation.providerResponse,
      },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: initiation.paymentStatus },
    }),
  ]);

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
  const orderId = callbackData.orderId?.trim();
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

    await tx.notification.create({
      data: {
        userId: order.userId,
        title: "Payment cancelled",
        message: `Payment for order ${order.orderNumber} was cancelled. You can retry payment from your order.`,
        type: "PAYMENT",
      },
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
    payment.status === PaymentStatus.CANCELLED ||
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
      verification.providerResponse,
    );
  } else if (verification.status === "FAILED") {
    await orderService.markPaymentFailedForOrder(
      payment.orderId,
      verification.rawStatus ?? "Provider reported a failed payment",
    );
  } else if (verification.status === "CANCELLED") {
    await markPaymentCancelled(payment.orderId, payment.id, verification);
  } else {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PROCESSING,
          providerPaymentId:
            verification.providerPaymentId ?? payment.providerPaymentId,
          providerResponse: verification.providerResponse,
        },
      }),
      prisma.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: PaymentStatus.PROCESSING },
      }),
    ]);
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

    const reason =
      typeof object.last_payment_error === "object" &&
      object.last_payment_error !== null
        ? String(
            (object.last_payment_error as Record<string, unknown>).message ??
              event.type,
          )
        : event.type;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status:
          event.type === "payment_intent.canceled"
            ? PaymentStatus.CANCELLED
            : PaymentStatus.FAILED,
        providerPaymentId: intentId ?? payment.providerPaymentId,
        providerResponse: JSON.parse(JSON.stringify(event)),
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus:
          event.type === "payment_intent.canceled"
            ? PaymentStatus.CANCELLED
            : PaymentStatus.FAILED,
      },
    });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, orderNumber: true },
    });

    if (order) {
      await prisma.notification.create({
        data: {
          userId: order.userId,
          title: "Card payment failed",
          message: `Card payment for order ${order.orderNumber} failed: ${reason}`,
          type: "PAYMENT",
        },
      });
    }

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

  if (input.status === "PAID") {
    await orderService.confirmPaymentForOrder(
      input.orderId,
      input.transactionId,
      input.providerReference,
    );
  } else {
    await orderService.markPaymentFailedForOrder(
      input.orderId,
      input.providerReference,
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId: input.orderId },
    select: paymentSelect,
  });

  if (!payment) {
    throw ApiError.notFound("Payment not found");
  }

  return toPaymentResponse(payment);
};
