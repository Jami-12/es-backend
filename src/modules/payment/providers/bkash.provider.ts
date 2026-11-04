import { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { bkashConfig, isBkashConfigured } from "../../../config/payment.config";
import { ApiError } from "../../../utils/ApiError";
import type {
  PaymentInitiationResult,
  PaymentProvider,
  PaymentVerificationContext,
  ProviderVerificationResult,
} from "../payment-provider.types";

type JsonObject = Record<string, unknown>;

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

const getString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asObject = (value: unknown): JsonObject => {
  if (typeof value === "object" && value !== null) {
    return value as JsonObject;
  }

  return {};
};

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const appendQuery = (url: string, params: Record<string, string>): string => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${new URLSearchParams(params).toString()}`;
};

const requireBaseUrl = (): string => {
  if (!bkashConfig.baseUrl) {
    throw new ApiError(
      503,
      "bKash is not configured. Set BKASH_ENABLED=true and configure BKASH_BASE_URL plus bKash credentials.",
    );
  }

  return bkashConfig.baseUrl.replace(/\/+$/, "");
};

const grantToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  if (
    !bkashConfig.appKey ||
    !bkashConfig.appSecret ||
    !bkashConfig.username ||
    !bkashConfig.password
  ) {
    throw new ApiError(
      503,
      "bKash is not configured. Set BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME and BKASH_PASSWORD, then enable BKASH_ENABLED.",
    );
  }

  const response = await fetch(
    `${requireBaseUrl()}/tokenized/checkout/token/grant`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        username: bkashConfig.username,
        password: bkashConfig.password,
      },
      body: JSON.stringify({
        app_key: bkashConfig.appKey,
        app_secret: bkashConfig.appSecret,
      }),
    },
  );

  const data = asObject(await response.json());
  const token = getString(data.id_token);

  if (!response.ok || !token) {
    throw new ApiError(
      502,
      getString(
        data.statusMessage,
        "Unable to obtain a bKash access token. Check your credentials.",
      ),
    );
  }

  const expiresIn =
    typeof data.expires_in === "number" ? data.expires_in : 3600;

  cachedToken = {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return token;
};

const authenticatedHeaders = (token: string): Record<string, string> => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: token,
  "X-APP-Key": bkashConfig.appKey ?? "",
});

export const queryBkashPayment = async (
  paymentId: string,
): Promise<JsonObject> => {
  const token = await grantToken();

  const response = await fetch(
    `${requireBaseUrl()}/tokenized/checkout/payment/query/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: authenticatedHeaders(token),
    },
  );

  return asObject(await response.json());
};

export const executeBkashPayment = async (
  paymentId: string,
): Promise<JsonObject> => {
  const token = await grantToken();

  const response = await fetch(
    `${requireBaseUrl()}/tokenized/checkout/execute`,
    {
      method: "POST",
      headers: authenticatedHeaders(token),
      body: JSON.stringify({ paymentID: paymentId }),
    },
  );

  return asObject(await response.json());
};

const isCompleted = (data: JsonObject): boolean =>
  getString(data.statusCode) === "0000" &&
  getString(data.transactionStatus).toLowerCase() === "completed";

const assertBkashPaymentMatches = (
  data: JsonObject,
  payment: PaymentVerificationContext,
): void => {
  const amountText = getString(data.amount);
  const amount = Number(amountText);
  const expectedAmount = Number(payment.amount);

  if (
    !amountText ||
    !Number.isFinite(amount) ||
    !Number.isFinite(expectedAmount) ||
    Math.abs(amount - expectedAmount) > 0.01
  ) {
    throw ApiError.badRequest(
      "bKash payment amount does not match this order",
    );
  }

  const currency = getString(data.currency).toUpperCase();

  if (currency && currency !== "BDT") {
    throw ApiError.badRequest(
      "bKash payment currency does not match this store",
    );
  }

  const invoice = getString(data.merchantInvoiceNumber);
  const returnedPaymentId = getString(data.paymentID);
  const completed = isCompleted(data);

  if (completed && (!invoice || invoice !== payment.orderNumber)) {
    throw ApiError.badRequest(
      "bKash payment does not belong to this order",
    );
  }

  if (invoice && invoice !== payment.orderNumber) {
    throw ApiError.badRequest(
      "bKash payment does not belong to this order",
    );
  }

  if (
    completed &&
    (!returnedPaymentId || returnedPaymentId !== payment.providerPaymentId)
  ) {
    throw ApiError.badRequest(
      "bKash payment reference does not match this order",
    );
  }

  if (
    returnedPaymentId &&
    payment.providerPaymentId &&
    returnedPaymentId !== payment.providerPaymentId
  ) {
    throw ApiError.badRequest(
      "bKash payment reference does not match this order",
    );
  }
};

const buildVerification = (data: JsonObject): ProviderVerificationResult => {
  const statusCode = getString(data.statusCode);
  const transactionStatus = getString(data.transactionStatus);
  const paymentId = getString(data.paymentID);
  const trxId = getString(data.trxID);

  if (statusCode === "0000" && transactionStatus.toLowerCase() === "completed") {
    return {
      status: "PAID",
      transactionId: trxId || paymentId,
      providerPaymentId: paymentId,
      providerReference: trxId || undefined,
      providerResponse: toJson(data),
      rawStatus: transactionStatus || statusCode,
    };
  }

  if (statusCode === "0000" && transactionStatus.toLowerCase() === "initiated") {
    return {
      status: "PENDING",
      providerPaymentId: paymentId,
      providerResponse: toJson(data),
      rawStatus: transactionStatus,
    };
  }

  const failureText = `${transactionStatus} ${getString(data.statusMessage)}`.toLowerCase();
  const cancelled =
    failureText.includes("cancel") || failureText.includes("abort");

  return {
    status: cancelled ? "CANCELLED" : "FAILED",
    providerPaymentId: paymentId || undefined,
    providerResponse: toJson(data),
    rawStatus: transactionStatus || getString(data.statusMessage),
  };
};

export const bkashProvider: PaymentProvider = {
  method: PaymentMethod.BKASH,

  isConfigured: isBkashConfigured,

  async initiate(order): Promise<PaymentInitiationResult> {
    if (!bkashConfig.callbackUrl) {
      throw new ApiError(503, "BKASH_CALLBACK_URL is not configured");
    }

    const token = await grantToken();
    const callbackUrl = appendQuery(bkashConfig.callbackUrl, {
      orderId: order.id,
    });

    const response = await fetch(
      `${requireBaseUrl()}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: authenticatedHeaders(token),
        body: JSON.stringify({
          mode: "0011",
          payerReference: order.customer.phone ?? order.customer.email,
          callbackURL: callbackUrl,
          amount: order.totalAmount.toFixed(2),
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: order.orderNumber,
        }),
      },
    );

    const data = asObject(await response.json());
    const bkashUrl = getString(data.bkashURL);

    if (!response.ok || !bkashUrl) {
      throw new ApiError(
        502,
        getString(
          data.statusMessage,
          "bKash payment could not be initiated. Please try again.",
        ),
      );
    }

    return {
      method: PaymentMethod.BKASH,
      paymentStatus: PaymentStatus.PROCESSING,
      message: "Redirect the customer to the bKash payment page",
      redirectUrl: bkashUrl,
      providerPaymentId: getString(data.paymentID) || undefined,
      providerReference: order.orderNumber,
      providerResponse: toJson(data),
    };
  },

  async verify(
    payment: PaymentVerificationContext,
    callbackData,
  ): Promise<ProviderVerificationResult> {
    const callbackPaymentId = callbackData.paymentID?.trim();

    if (
      payment.providerPaymentId &&
      callbackPaymentId &&
      callbackPaymentId !== payment.providerPaymentId
    ) {
      throw ApiError.badRequest(
        "bKash callback paymentID does not match this order",
      );
    }

    const paymentId = callbackPaymentId || payment.providerPaymentId;

    if (!paymentId) {
      throw ApiError.badRequest(
        "bKash callback is missing paymentID and the order has no stored payment reference",
      );
    }

    const callbackStatus = callbackData.status?.toLowerCase() ?? "";

    if (callbackStatus === "success" || callbackStatus === "completed") {
      const executed = await executeBkashPayment(paymentId);

      if (isCompleted(executed)) {
        assertBkashPaymentMatches(executed, payment);
        return buildVerification(executed);
      }

      const queried = await queryBkashPayment(paymentId);
      assertBkashPaymentMatches(queried, payment);
      return buildVerification(queried);
    }

    // Never trust a `status=cancel` query parameter on its own: callbacks are
    // public URLs and can be replayed with arbitrary values. Ask bKash for the
    // authoritative transaction status instead.
    const queried = await queryBkashPayment(paymentId);
    assertBkashPaymentMatches(queried, payment);
    return buildVerification(queried);
  },
};
