import { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { bkashConfig, isBkashConfigured } from "../../../config/payment.config";
import { ApiError } from "../../../utils/ApiError";
import type {
  PaymentInitiationResult,
  PaymentProvider,
  PaymentVerificationContext,
  ProviderVerificationResult,
} from "../payment-provider.types";
import {
  gatewayErrorMessage,
  gatewayFetch,
  readGatewayResponse,
  unusableGatewayMessage,
} from "./gateway-response";

type JsonObject = Record<string, unknown>;

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let tokenRequest: Promise<CachedToken> | null = null;

/**
 * Clears the cached access token. Used when bKash rejects the cached token
 * (401/403) and by automated tests that need a clean token state.
 */
export const resetBkashTokenCache = (): void => {
  cachedToken = null;
  tokenRequest = null;
};

const parseExpiresIn = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  // bKash currently returns 3600, but it has also returned strings. Clamp the
  // value so a broken response cannot create a token cached for a decade.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3600;
  }

  return Math.min(parsed, 86_400);
};

const getString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const appendQuery = (url: string, params: Record<string, string>): string => {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${new URLSearchParams(params).toString()}`;
};

const parseHttpsRedirectUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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

const requestToken = async (): Promise<CachedToken> => {
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

  const response = await gatewayFetch(
    `${requireBaseUrl()}/tokenized/checkout/token/grant`,
    {
      provider: "bKash",
      operation: "requesting an access token",
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

  const gateway = await readGatewayResponse(response, {
    provider: "bKash",
    operation: "token grant",
  });
  const data = gateway.data;
  const token = getString(data.id_token);

  if (!gateway.httpOk || !gateway.isUsableJson || !token) {
    const providerMessage = gatewayErrorMessage(
      data,
      "statusMessage",
      "errorMessage",
    );

    throw new ApiError(
      502,
      gateway.isUsableJson && providerMessage
        ? providerMessage
        : gateway.httpOk
          ? "bKash returned an unreadable response while requesting an access token. Please try again."
          : unusableGatewayMessage(gateway, "requesting an access token"),
    );
  }

  return {
    token,
    expiresAt: Date.now() + parseExpiresIn(data.expires_in) * 1000,
  };
};

const grantToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  // Several checkout requests can arrive at once (customer double click,
  // retries). Share one token request instead of issuing a burst of grants.
  if (!tokenRequest) {
    tokenRequest = requestToken();
  }

  const pending = tokenRequest;

  try {
    const token = await pending;

    if (tokenRequest === pending) {
      cachedToken = token;
      return token.token;
    }

    // Another request invalidated this grant while it was in flight (for
    // example after a 401). Never let the older token overwrite a newer one.
    return cachedToken?.token ?? token.token;
  } finally {
    if (tokenRequest === pending) {
      tokenRequest = null;
    }
  }
};

const authenticatedHeaders = (token: string): Record<string, string> => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: token,
  "X-APP-Key": bkashConfig.appKey ?? "",
});

type BkashRequestInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/**
 * Executes an authenticated bKash request. If bKash rejects a cached access
 * token (401/403), the cache is cleared and the request is retried exactly
 * once with a fresh token. The retry is safe because every caller either reads
 * state (query) or relies on bKash's own idempotency for execute.
 */
const bkashAuthenticatedRequest = async (
  path: string,
  init: BkashRequestInit,
  operation: string,
) => {
  const send = async (token: string) =>
    gatewayFetch(`${requireBaseUrl()}${path}`, {
      ...init,
      provider: "bKash",
      operation,
      headers: {
        ...authenticatedHeaders(token),
        ...(init.headers ?? {}),
      },
    });

  let token = await grantToken();
  let response = await send(token);
  let gateway = await readGatewayResponse(response, {
    provider: "bKash",
    operation,
  });

  if (gateway.httpStatus === 401 || gateway.httpStatus === 403) {
    resetBkashTokenCache();
    token = await grantToken();
    response = await send(token);
    gateway = await readGatewayResponse(response, {
      provider: "bKash",
      operation: `${operation} (retry after token refresh)`,
    });
  }

  return gateway;
};

export const queryBkashPayment = async (
  paymentId: string,
): Promise<JsonObject> => {
  const gateway = await bkashAuthenticatedRequest(
    `/tokenized/checkout/payment/query/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
    "payment query",
  );

  if (!gateway.httpOk || !gateway.isUsableJson) {
    throw new ApiError(
      502,
      unusableGatewayMessage(gateway, "checking the payment status"),
    );
  }

  return gateway.data;
};

export const executeBkashPayment = async (
  paymentId: string,
): Promise<JsonObject> => {
  const gateway = await bkashAuthenticatedRequest(
    "/tokenized/checkout/execute",
    {
      method: "POST",
      body: JSON.stringify({ paymentID: paymentId }),
    },
    "payment execute",
  );

  if (!gateway.httpOk || !gateway.isUsableJson) {
    throw new ApiError(
      502,
      unusableGatewayMessage(gateway, "executing the payment"),
    );
  }

  return gateway.data;
};

const isCompleted = (data: JsonObject): boolean =>
  getString(data.statusCode) === "0000" &&
  getString(data.transactionStatus).toLowerCase() === "completed";

const assertBkashPaymentMatches = (
  data: JsonObject,
  payment: PaymentVerificationContext,
): void => {
  const completed = isCompleted(data);
  const amountText = getString(data.amount);

  if (amountText) {
    const amount = Number(amountText);
    const expectedAmount = Number(payment.amount);

    if (
      !Number.isFinite(amount) ||
      !Number.isFinite(expectedAmount) ||
      Math.abs(amount - expectedAmount) > 0.01
    ) {
      throw ApiError.badRequest(
        "bKash payment amount does not match this order",
      );
    }
  } else if (completed) {
    throw ApiError.badRequest(
      "bKash completed payment is missing the paid amount",
    );
  }

  const currency = getString(data.currency).toUpperCase();

  if (currency) {
    if (currency !== "BDT") {
      throw ApiError.badRequest(
        "bKash payment currency does not match this store",
      );
    }
  } else if (completed) {
    throw ApiError.badRequest(
      "bKash completed payment is missing the currency",
    );
  }

  const invoice = getString(data.merchantInvoiceNumber);

  if (invoice && invoice !== payment.orderNumber) {
    throw ApiError.badRequest("bKash payment does not belong to this order");
  }

  if (completed && invoice !== payment.orderNumber) {
    throw ApiError.badRequest(
      "bKash completed payment is missing a matching invoice number",
    );
  }

  const returnedPaymentId = getString(data.paymentID);

  if (
    returnedPaymentId &&
    payment.providerPaymentId &&
    returnedPaymentId !== payment.providerPaymentId
  ) {
    throw ApiError.badRequest(
      "bKash payment reference does not match this order",
    );
  }

  if (
    completed &&
    (!returnedPaymentId || returnedPaymentId !== payment.providerPaymentId)
  ) {
    throw ApiError.badRequest(
      "bKash completed payment is missing a matching paymentID",
    );
  }
};

const buildVerification = (data: JsonObject): ProviderVerificationResult => {
  const statusCode = getString(data.statusCode);
  const transactionStatus = getString(data.transactionStatus);
  const normalizedStatus = transactionStatus.toLowerCase();
  const paymentId = getString(data.paymentID);
  const trxId = getString(data.trxID);

  if (statusCode === "0000" && normalizedStatus === "completed") {
    return {
      status: "PAID",
      transactionId: trxId || paymentId,
      providerPaymentId: paymentId,
      providerReference: trxId || undefined,
      providerResponse: toJson(data),
      rawStatus: transactionStatus || statusCode,
    };
  }

  const failureText =
    `${transactionStatus} ${getString(data.statusMessage)}`.toLowerCase();
  const cancelled =
    failureText.includes("cancel") || failureText.includes("abort");

  if (cancelled) {
    return {
      status: "CANCELLED",
      providerPaymentId: paymentId || undefined,
      providerResponse: toJson(data),
      rawStatus: transactionStatus || getString(data.statusMessage),
    };
  }

  // bKash can return statusCode 0000 for a payment that was declined, expired
  // or rejected, with the real outcome in transactionStatus/statusMessage.
  // Treat those as authoritative failures instead of leaving the payment
  // stuck in PROCESSING forever.
  const failed = [
    "fail",
    "declin",
    "reject",
    "expire",
    "timeout",
    "timed out",
    "insufficient",
  ].some((keyword) => failureText.includes(keyword));

  if (failed) {
    return {
      status: "FAILED",
      providerPaymentId: paymentId || undefined,
      providerResponse: toJson(data),
      rawStatus: transactionStatus || getString(data.statusMessage),
    };
  }

  // bKash uses 0000 for every successfully processed query, including a
  // payment that is still initiated. Anything else is an authoritative
  // failure; an unknown 0000 state must not be reported as paid.
  if (statusCode === "0000") {
    return {
      status: "PENDING",
      providerPaymentId: paymentId || undefined,
      providerResponse: toJson(data),
      rawStatus: transactionStatus || statusCode,
    };
  }

  return {
    status: "FAILED",
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

    const callbackUrl = appendQuery(bkashConfig.callbackUrl, {
      orderId: order.id,
    });

    const gateway = await bkashAuthenticatedRequest(
      "/tokenized/checkout/create",
      {
        method: "POST",
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
      "payment create",
    );
    const data = gateway.data;
    const rawBkashUrl = getString(data.bkashURL);
    const bkashUrl = parseHttpsRedirectUrl(rawBkashUrl);
    const paymentId = getString(data.paymentID);

    if (
      !gateway.httpOk ||
      !gateway.isUsableJson ||
      !bkashUrl ||
      !paymentId
    ) {
      const providerMessage = gatewayErrorMessage(
        data,
        "statusMessage",
        "errorMessage",
      );

      throw new ApiError(
        502,
        gateway.isUsableJson && providerMessage
          ? providerMessage
          : gateway.httpOk
            ? "bKash returned an incomplete checkout response. Please try again."
            : unusableGatewayMessage(gateway, "creating the payment"),
      );
    }

    return {
      method: PaymentMethod.BKASH,
      paymentStatus: PaymentStatus.PROCESSING,
      message: "Redirect the customer to the bKash payment page",
      redirectUrl: bkashUrl,
      providerPaymentId: paymentId,
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
      let executed: JsonObject | null = null;

      try {
        executed = await executeBkashPayment(paymentId);
      } catch (error) {
        if (!(error instanceof ApiError)) {
          throw error;
        }

        // Execution may fail because the payment was already executed, or
        // because bKash returned an unreadable body. The query endpoint is the
        // authoritative fallback and must still be checked.
      }

      if (executed && isCompleted(executed)) {
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
