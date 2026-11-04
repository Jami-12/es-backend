import {
  constants as cryptoConstants,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { isNagadConfigured, nagadConfig } from "../../../config/payment.config";
import { ApiError } from "../../../utils/ApiError";
import type {
  PaymentInitiationResult,
  PaymentProvider,
  PaymentVerificationContext,
  ProviderVerificationResult,
} from "../payment-provider.types";

type JsonObject = Record<string, unknown>;

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

const requireBaseUrl = (): string => {
  if (!nagadConfig.baseUrl) {
    throw new ApiError(
      503,
      "Nagad is not configured. Set NAGAD_ENABLED=true and configure NAGAD_BASE_URL plus Nagad credentials.",
    );
  }

  return nagadConfig.baseUrl.replace(/\/+$/, "");
};

/* ------------------------------------------------------------------ */
/* Key normalization                                                   */
/* ------------------------------------------------------------------ */

interface PemParts {
  label: string | null;
  /** Base64 body with all ASCII whitespace and stray backslashes removed. */
  body: string;
  /** Position of the first stray backslash, if the value contained one. */
  strayBackslashIndex: number | null;
}

const wrapPem = (label: string, body: string): string => {
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;

  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
};

/**
 * Accepts keys copied from dashboards, JSON strings, or .env files. Handles
 * literal `\n` sequences, surrounding quotes, missing PEM banners, and stray
 * backslashes introduced while pasting a key.
 */
const readPemParts = (raw: string): PemParts => {
  const normalized = raw
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .replace(/\\r\\n|\\n|\\r/g, "\n");

  const label =
    normalized.match(/-----BEGIN ([A-Z0-9 ]+)-----/)?.[1]?.trim() ?? null;

  const bodyWithStray = normalized
    .replace(/-----BEGIN [A-Z0-9 ]+-----/g, "")
    .replace(/-----END [A-Z0-9 ]+-----/g, "")
    .replace(/\s+/g, "");

  const strayBackslashIndex = bodyWithStray.indexOf("\\");

  return {
    label,
    body: bodyWithStray.replace(/\\/g, ""),
    strayBackslashIndex: strayBackslashIndex >= 0 ? strayBackslashIndex : null,
  };
};

const parsePrivateKey = (body: string): KeyObject | null => {
  // Nagad issues PKCS#1 keys, but some accounts provide PKCS#8. The DER body
  // decides the real format; the banner must match what OpenSSL receives.
  for (const label of [
    "PRIVATE KEY",
    "RSA PRIVATE KEY",
    "ENCRYPTED PRIVATE KEY",
  ]) {
    try {
      const key = createPrivateKey(wrapPem(label, body));

      if (key.type === "private") {
        return key;
      }
    } catch {
      // Try the next banner. Do not surface OpenSSL decoder details.
    }
  }

  return null;
};

const parsePublicKey = (body: string): KeyObject | null => {
  for (const label of ["PUBLIC KEY", "RSA PUBLIC KEY"]) {
    try {
      const key = createPublicKey(wrapPem(label, body));

      if (key.type === "public") {
        return key;
      }
    } catch {
      // Try the next banner.
    }
  }

  return null;
};

const exportPublicDer = (key: KeyObject): Buffer => {
  const exported = key.export({ type: "spki", format: "der" });

  return Buffer.isBuffer(exported) ? exported : Buffer.from(exported);
};

const privateKeyMatchesPublic = (
  privateKey: KeyObject,
  publicKey: KeyObject,
): boolean => {
  try {
    return exportPublicDer(createPublicKey(privateKey)).equals(
      exportPublicDer(publicKey),
    );
  } catch {
    return false;
  }
};

/**
 * Recovers a private key that was corrupted by a few stray characters during
 * copy/paste. Only a candidate whose derived public key exactly matches the
 * configured NAGAD_PUBLIC_KEY is accepted, so a wrong repair can never be used.
 */
const recoverPrivateKeyNearStrayCharacter = (
  parts: PemParts,
  publicKey: KeyObject,
): KeyObject | null => {
  if (parts.strayBackslashIndex === null) {
    return null;
  }

  const body = parts.body;
  const center = Math.min(parts.strayBackslashIndex, body.length);
  const start = Math.max(0, center - 32);
  const end = Math.min(body.length, center + 8);

  for (let i = start; i < end; i += 1) {
    const single = body.slice(0, i) + body.slice(i + 1);
    const singleKey = parsePrivateKey(single);

    if (singleKey && privateKeyMatchesPublic(singleKey, publicKey)) {
      return singleKey;
    }

    for (let gap = 1; gap <= 4; gap += 1) {
      const j = i + gap;

      if (j >= end) {
        break;
      }

      const candidate = body.slice(0, i) + body.slice(i + 1, j) + body.slice(j + 1);
      const candidateKey = parsePrivateKey(candidate);

      if (candidateKey && privateKeyMatchesPublic(candidateKey, publicKey)) {
        return candidateKey;
      }
    }
  }

  return null;
};

interface ResolvedNagadKeys {
  privateKey: KeyObject;
  publicKey: KeyObject;
}

let cachedKeys: ResolvedNagadKeys | null = null;

const resolveKeys = (): ResolvedNagadKeys => {
  if (cachedKeys) {
    return cachedKeys;
  }

  if (!nagadConfig.privateKey || !nagadConfig.publicKey) {
    throw new ApiError(
      503,
      "Nagad is not configured. Set NAGAD_PRIVATE_KEY and NAGAD_PUBLIC_KEY, then enable NAGAD_ENABLED.",
    );
  }

  const publicParts = readPemParts(nagadConfig.publicKey);
  const publicKey = parsePublicKey(publicParts.body);

  if (!publicKey) {
    throw new ApiError(
      503,
      "Nagad public key could not be parsed. Replace NAGAD_PUBLIC_KEY with the complete PEM public key issued by Nagad.",
    );
  }

  const privateParts = readPemParts(nagadConfig.privateKey);
  let privateKey = parsePrivateKey(privateParts.body);

  if (!privateKey || !privateKeyMatchesPublic(privateKey, publicKey)) {
    privateKey = recoverPrivateKeyNearStrayCharacter(privateParts, publicKey);
  }

  if (!privateKey) {
    throw new ApiError(
      503,
      "Nagad private key could not be parsed. Replace NAGAD_PRIVATE_KEY with a complete PKCS#1 or PKCS#8 PEM private key.",
    );
  }

  if (!privateKeyMatchesPublic(privateKey, publicKey)) {
    throw new ApiError(
      503,
      "Nagad private key does not match NAGAD_PUBLIC_KEY. Configure the matching key pair issued for this merchant account.",
    );
  }

  cachedKeys = { privateKey, publicKey };

  return cachedKeys;
};

/**
 * Validates the configured Nagad key pair without making a network request.
 * Useful for startup diagnostics and provider health checks.
 */
export const validateNagadKeyConfiguration = (): void => {
  resolveKeys();
};

const withKeyError = <T>(operation: () => T): T => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Never let OpenSSL decoder output reach the browser.
    throw new ApiError(
      502,
      "Nagad cryptographic operation failed. Verify the configured Nagad key pair and format.",
    );
  }
};

const encryptWithPublicKey = (plainText: string): string =>
  withKeyError(() => {
    const { publicKey } = resolveKeys();

    return publicEncrypt(
      {
        key: publicKey,
        padding: cryptoConstants.RSA_PKCS1_PADDING,
      },
      Buffer.from(plainText, "utf8"),
    ).toString("base64");
  });

const decryptWithPrivateKey = (encrypted: string): string =>
  withKeyError(() => {
    const { privateKey } = resolveKeys();

    return privateDecrypt(
      {
        key: privateKey,
        padding: cryptoConstants.RSA_PKCS1_PADDING,
      },
      Buffer.from(encrypted, "base64"),
    ).toString("utf8");
  });

const signWithPrivateKey = (data: string): string =>
  withKeyError(() => {
    const { privateKey } = resolveKeys();
    const signer = createSign("SHA256");
    signer.update(data, "utf8");
    signer.end();
    return signer.sign(privateKey, "base64");
  });

const verifyWithPublicKey = (data: string, signature: string): boolean =>
  withKeyError(() => {
    const { publicKey } = resolveKeys();
    const verifier = createVerify("SHA256");
    verifier.update(data, "utf8");
    verifier.end();
    return verifier.verify(publicKey, signature, "base64");
  });

const formatDateTime = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const createChallenge = (): string => randomBytes(20).toString("hex");

const nagadHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-KM-Api-Version": "v-0.2.0",
  "X-KM-IP-V4": "127.0.0.1",
  "X-KM-Client-Type": "PC_WEB",
});

interface NagadSession {
  paymentReferenceId: string;
  challenge: string;
}

const initializeSession = async (
  orderId: string,
): Promise<NagadSession> => {
  if (!nagadConfig.merchantId || !nagadConfig.merchantNumber) {
    throw new ApiError(
      503,
      "Nagad is not configured. Set NAGAD_MERCHANT_ID and NAGAD_MERCHANT_NUMBER, then enable NAGAD_ENABLED.",
    );
  }

  const dateTime = formatDateTime(new Date());
  const challenge = createChallenge();

  const sensitivePayload = JSON.stringify({
    merchantId: nagadConfig.merchantId,
    datetime: dateTime,
    orderId,
    challenge,
  });

  const sensitiveData = encryptWithPublicKey(sensitivePayload);
  const signature = signWithPrivateKey(sensitiveData);

  const response = await fetch(
    `${requireBaseUrl()}/check-out/initialize/${encodeURIComponent(nagadConfig.merchantId)}/${encodeURIComponent(orderId)}`,
    {
      method: "POST",
      headers: nagadHeaders(),
      body: JSON.stringify({
        accountNumber: nagadConfig.merchantNumber,
        dateTime,
        sensitiveData,
        signature,
      }),
    },
  );

  const data = asObject(await response.json());
  const responseSensitiveData = getString(data.sensitiveData);
  const responseSignature = getString(data.signature);

  if (!response.ok || !responseSensitiveData || !responseSignature) {
    throw new ApiError(
      502,
      getString(
        data.message,
        "Nagad payment session could not be initialized.",
      ),
    );
  }

  if (!verifyWithPublicKey(responseSensitiveData, responseSignature)) {
    throw new ApiError(502, "Nagad response signature verification failed");
  }

  let decrypted: JsonObject;

  try {
    decrypted = JSON.parse(
      decryptWithPrivateKey(responseSensitiveData),
    ) as JsonObject;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(502, "Nagad response could not be decoded.");
  }

  const paymentReferenceId = getString(decrypted.paymentReferenceId);
  const responseChallenge = getString(decrypted.challenge, challenge);

  if (!paymentReferenceId) {
    throw new ApiError(502, "Nagad did not return a payment reference id");
  }

  return { paymentReferenceId, challenge: responseChallenge };
};

const completeSession = async (
  session: NagadSession,
  orderId: string,
  amount: string,
): Promise<string> => {
  if (!nagadConfig.merchantId) {
    throw new ApiError(503, "Nagad merchant id is not configured");
  }

  const sensitivePayload = JSON.stringify({
    merchantId: nagadConfig.merchantId,
    orderId,
    currencyCode: "050",
    amount,
    challenge: session.challenge,
  });

  const sensitiveData = encryptWithPublicKey(sensitivePayload);
  const signature = signWithPrivateKey(sensitiveData);

  const response = await fetch(
    `${requireBaseUrl()}/check-out/complete/${encodeURIComponent(session.paymentReferenceId)}`,
    {
      method: "POST",
      headers: nagadHeaders(),
      body: JSON.stringify({
        paymentReferenceId: session.paymentReferenceId,
        challenge: session.challenge,
        sensitiveData,
        signature,
      }),
    },
  );

  const data = asObject(await response.json());
  const callbackUrl = getString(data.callBackUrl);

  if (!response.ok || !callbackUrl) {
    throw new ApiError(
      502,
      getString(data.message, "Nagad payment could not be completed."),
    );
  }

  return callbackUrl;
};

const verifyNagadPayment = async (
  paymentReferenceId: string,
): Promise<JsonObject> => {
  const response = await fetch(
    `${requireBaseUrl()}/verify/payment/${encodeURIComponent(paymentReferenceId)}`,
    {
      method: "GET",
      headers: nagadHeaders(),
    },
  );

  return asObject(await response.json());
};

const buildVerification = (data: JsonObject): ProviderVerificationResult => {
  const status = getString(data.status).toLowerCase();
  const statusCode = getString(data.statusCode);
  const paymentReferenceId = getString(data.paymentReferenceId);
  const issuerPaymentRefNo = getString(data.issuerPaymentRefNo);

  if (status === "success" || statusCode === "000") {
    return {
      status: "PAID",
      transactionId: issuerPaymentRefNo || paymentReferenceId,
      providerPaymentId: paymentReferenceId || undefined,
      providerReference: issuerPaymentRefNo || undefined,
      providerResponse: toJson(data),
      rawStatus: getString(data.status),
    };
  }

  if (status === "aborted" || status === "cancelled" || status === "canceled") {
    return {
      status: "CANCELLED",
      providerPaymentId: paymentReferenceId || undefined,
      providerResponse: toJson(data),
      rawStatus: getString(data.status),
    };
  }

  if (!status && !statusCode) {
    return {
      status: "PENDING",
      providerPaymentId: paymentReferenceId || undefined,
      providerResponse: toJson(data),
    };
  }

  return {
    status: "FAILED",
    providerPaymentId: paymentReferenceId || undefined,
    providerResponse: toJson(data),
    rawStatus: getString(data.status) || getString(data.message),
  };
};

const assertNagadPaymentMatches = (
  data: JsonObject,
  payment: PaymentVerificationContext,
  callbackPaymentRef: string,
): void => {
  const returnedRef = getString(data.paymentReferenceId);

  if (returnedRef && returnedRef !== callbackPaymentRef) {
    throw ApiError.badRequest(
      "Nagad payment reference does not match this order",
    );
  }

  const returnedOrderId =
    getString(data.orderId) || getString(data.merchantOrderId);

  if (!returnedOrderId || returnedOrderId !== payment.orderId) {
    throw ApiError.badRequest("Nagad payment does not belong to this order");
  }

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
      "Nagad payment amount does not match this order",
    );
  }

  const currencyCode = getString(data.currencyCode);

  if (currencyCode && currencyCode !== "050") {
    throw ApiError.badRequest(
      "Nagad payment currency does not match this store",
    );
  }
};

export const nagadProvider: PaymentProvider = {
  method: PaymentMethod.NAGAD,

  isConfigured: isNagadConfigured,

  async initiate(order): Promise<PaymentInitiationResult> {
    const session = await initializeSession(order.id);
    const redirectUrl = await completeSession(
      session,
      order.id,
      order.totalAmount.toFixed(2),
    );

    return {
      method: PaymentMethod.NAGAD,
      paymentStatus: PaymentStatus.PROCESSING,
      message: "Redirect the customer to the Nagad payment page",
      redirectUrl,
      providerPaymentId: session.paymentReferenceId,
      providerReference: order.orderNumber,
      providerResponse: toJson({
        paymentReferenceId: session.paymentReferenceId,
        status: "INITIALIZED",
      }),
    };
  },

  async verify(
    payment: PaymentVerificationContext,
    callbackData,
  ): Promise<ProviderVerificationResult> {
    const callbackPaymentRef =
      callbackData.payment_ref_id?.trim() ||
      callbackData.paymentReferenceId?.trim();

    if (!callbackPaymentRef) {
      throw ApiError.badRequest("Nagad callback is missing payment reference id");
    }

    if (!payment.providerPaymentId) {
      throw ApiError.badRequest(
        "Nagad payment was not initiated for this order",
      );
    }

    if (callbackPaymentRef !== payment.providerPaymentId) {
      throw ApiError.badRequest(
        "Nagad callback payment reference does not match this order",
      );
    }

    // The callback is an unauthenticated redirect, so it must not decide the
    // outcome. Always resolve the authoritative status through Nagad's verify
    // endpoint before touching the order or payment record.
    const verified = await verifyNagadPayment(callbackPaymentRef);
    assertNagadPaymentMatches(verified, payment, callbackPaymentRef);

    return buildVerification({
      ...verified,
      paymentReferenceId:
        getString(verified.paymentReferenceId) || callbackPaymentRef,
    });
  },
};
