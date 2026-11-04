import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { cardConfig, isCardConfigured } from "../../../config/payment.config";
import { ApiError } from "../../../utils/ApiError";
import type {
  PaymentInitiationResult,
  PaymentProvider,
  PaymentVerificationContext,
  ProviderVerificationResult,
} from "../payment-provider.types";

type JsonObject = Record<string, unknown>;

const STRIPE_API_BASE = "https://api.stripe.com/v1";

const asObject = (value: unknown): JsonObject => {
  if (typeof value === "object" && value !== null) {
    return value as JsonObject;
  }

  return {};
};

const getString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const requireStripe = (): string => {
  if (!isCardConfigured() || !cardConfig.secretKey) {
    throw new ApiError(
      503,
      "Card payments are not configured. Set STRIPE_ENABLED=true and configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
    );
  }

  return cardConfig.secretKey;
};

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: JsonObject;
  };
}

export const verifyStripeWebhookSignature = (
  rawPayload: Buffer,
  signatureHeader: string | undefined,
): StripeWebhookEvent => {
  if (!cardConfig.webhookSecret) {
    throw new ApiError(
      503,
      "Card webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET.",
    );
  }

  if (!signatureHeader) {
    throw ApiError.unauthorized("Missing Stripe-Signature header");
  }

  const parts = signatureHeader.split(",").reduce<Record<string, string>>(
    (accumulator, part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        accumulator[key] = value;
      }
      return accumulator;
    },
    {},
  );

  const timestamp = parts.t;
  const providedSignature = parts.v1;

  if (!timestamp || !providedSignature) {
    throw ApiError.unauthorized("Malformed Stripe-Signature header");
  }

  const timestampMs = Number(timestamp) * 1000;

  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 300_000) {
    throw ApiError.unauthorized("Stripe webhook timestamp is outside tolerance");
  }

  const expectedSignature = createHmac("sha256", cardConfig.webhookSecret)
    .update(`${timestamp}.${rawPayload.toString("utf8")}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const providedBuffer = Buffer.from(providedSignature, "utf8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw ApiError.unauthorized("Invalid Stripe webhook signature");
  }

  const parsed = JSON.parse(rawPayload.toString("utf8")) as StripeWebhookEvent;

  if (!parsed || typeof parsed.type !== "string" || !parsed.data?.object) {
    throw ApiError.badRequest("Invalid Stripe webhook payload");
  }

  return parsed;
};

const createPaymentIntent = async (
  orderId: string,
  orderNumber: string,
  totalAmount: number,
): Promise<JsonObject> => {
  const secretKey = requireStripe();
  const amountInMinorUnits = Math.round(totalAmount * 100);

  if (amountInMinorUnits <= 0) {
    throw ApiError.badRequest("Order amount must be greater than zero");
  }

  const body = new URLSearchParams();
  body.set("amount", String(amountInMinorUnits));
  body.set("currency", cardConfig.currency);
  body.set("automatic_payment_methods[enabled]", "true");
  body.set("metadata[orderId]", orderId);
  body.set("metadata[orderNumber]", orderNumber);

  const response = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = asObject(await response.json());

  if (!response.ok) {
    const error = asObject(data.error);
    throw new ApiError(
      502,
      getString(error.message, "Card payment could not be initiated"),
    );
  }

  return data;
};

export const refundStripePayment = async (
  providerPaymentId: string,
): Promise<JsonObject> => {
  const secretKey = requireStripe();
  const body = new URLSearchParams();
  body.set("payment_intent", providerPaymentId);

  const response = await fetch(`${STRIPE_API_BASE}/refunds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = asObject(await response.json());

  if (!response.ok) {
    const error = asObject(data.error);
    throw new ApiError(
      502,
      getString(error.message, "Card refund could not be processed"),
    );
  }

  return data;
};

export const cardProvider: PaymentProvider = {
  method: PaymentMethod.CARD,

  isConfigured: isCardConfigured,

  async initiate(order): Promise<PaymentInitiationResult> {
    const intent = await createPaymentIntent(
      order.id,
      order.orderNumber,
      order.totalAmount,
    );

    const clientSecret = getString(intent.client_secret);
    const intentId = getString(intent.id);

    if (!clientSecret || !intentId) {
      throw new ApiError(502, "Stripe did not return a client secret");
    }

    return {
      method: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.PROCESSING,
      message:
        "Confirm the card payment on the client using the returned client secret",
      clientSecret,
      providerPaymentId: intentId,
      providerReference: order.orderNumber,
      providerResponse: toJson({
        id: intentId,
        status: intent.status,
      }),
    };
  },

  async verify(
    payment: PaymentVerificationContext,
    callbackData,
  ): Promise<ProviderVerificationResult> {
    const intentId =
      callbackData.paymentIntentId?.trim() || payment.providerPaymentId;

    if (!intentId) {
      throw ApiError.badRequest("Card verification is missing a payment intent id");
    }

    const secretKey = requireStripe();
    const response = await fetch(
      `${STRIPE_API_BASE}/payment_intents/${encodeURIComponent(intentId)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      },
    );

    const data = asObject(await response.json());

    if (!response.ok) {
      throw new ApiError(502, "Card payment could not be verified");
    }

    const returnedIntentId = getString(data.id);
    const status = getString(data.status);
    const metadata = asObject(data.metadata);
    const metadataOrderId = getString(metadata.orderId);

    if (!returnedIntentId || returnedIntentId !== intentId) {
      throw ApiError.badRequest(
        "Card payment intent reference does not match this payment",
      );
    }

    if (!metadataOrderId || metadataOrderId !== payment.orderId) {
      throw ApiError.badRequest(
        "Card payment intent does not belong to this order",
      );
    }

    const paidAmount = Number(data.amount);
    const expectedAmount = Math.round(Number(payment.amount) * 100);
    const paidCurrency = getString(data.currency).toLowerCase();

    if (
      !Number.isInteger(paidAmount) ||
      !Number.isInteger(expectedAmount) ||
      paidAmount !== expectedAmount
    ) {
      throw ApiError.badRequest(
        "Card payment amount does not match this order",
      );
    }

    if (!paidCurrency || paidCurrency !== cardConfig.currency) {
      throw ApiError.badRequest(
        "Card payment currency does not match this store",
      );
    }

    if (status === "succeeded") {
      return {
        status: "PAID",
        transactionId: intentId,
        providerPaymentId: intentId,
        providerReference: getString(data.latest_charge) || intentId,
        providerResponse: toJson(data),
        rawStatus: status,
      };
    }

    if (status === "canceled") {
      return {
        status: "CANCELLED",
        providerPaymentId: intentId,
        providerResponse: toJson(data),
        rawStatus: status,
      };
    }

    if (
      status === "processing" ||
      status === "requires_action" ||
      status === "requires_confirmation" ||
      status === "requires_payment_method" ||
      status === "requires_capture"
    ) {
      const clientSecret = getString(data.client_secret) || undefined;

      return {
        status: "PENDING",
        providerPaymentId: intentId,
        providerResponse: toJson(data),
        rawStatus: status,
        ...(clientSecret ? { clientSecret } : {}),
      };
    }

    return {
      status: "FAILED",
      providerPaymentId: intentId,
      providerResponse: toJson(data),
      rawStatus: status,
    };
  },
};
