import { randomBytes } from "node:crypto";
import { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { getBackendOrigin } from "../../../config/origins";
import { isNagadSimulationEnabled } from "../../../config/payment.config";
import { ApiError } from "../../../utils/ApiError";
import type {
  PaymentInitiationResult,
  PaymentProvider,
  PaymentVerificationContext,
  ProviderVerificationResult,
} from "../payment-provider.types";

type JsonObject = Record<string, unknown>;

/** Marker that identifies a payment created by the local simulation. */
export const NAGAD_SIMULATION_PREFIX = "SIMNAGAD-";

const getString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const simulationBaseUrl = (): string =>
  getBackendOrigin().replace(/\/+$/, "");

const buildSimulationUrl = (
  orderId: string,
  reference: string,
  orderNumber: string,
  amount: string,
): string => {
  const url = new URL(
    `${simulationBaseUrl()}/api/v1/payments/nagad/simulate`,
  );
  url.searchParams.set("orderId", orderId);
  url.searchParams.set("ref", reference);
  url.searchParams.set("orderNumber", orderNumber);
  url.searchParams.set("amount", amount);
  return url.toString();
};

/**
 * A development-only stand-in for the Nagad provider. The live Nagad sandbox is
 * frequently unreachable (it is often restricted to Bangladeshi networks and
 * requires merchant-issued credentials), which makes it impossible to exercise
 * the redirect -> callback -> verify flow locally.
 *
 * This provider keeps the exact same contract as the real one so the rest of
 * the payment pipeline (claiming, callback handling, order confirmation) is
 * unchanged. It is only ever selected when NAGAD_SIMULATION=true, NAGAD_ENABLED
 * is true and NODE_ENV is not production; see `isNagadSimulationEnabled`.
 */
export const simulationNagadProvider: PaymentProvider = {
  method: PaymentMethod.NAGAD,

  isConfigured: isNagadSimulationEnabled,

  async initiate(order): Promise<PaymentInitiationResult> {
    if (!isNagadSimulationEnabled()) {
      throw new ApiError(503, "Nagad simulation is not enabled");
    }

    const reference = `${NAGAD_SIMULATION_PREFIX}${randomBytes(8).toString("hex")}`;
    const amount = order.totalAmount.toFixed(2);
    const redirectUrl = buildSimulationUrl(
      order.id,
      reference,
      order.orderNumber,
      amount,
    );

    return {
      method: PaymentMethod.NAGAD,
      paymentStatus: PaymentStatus.PROCESSING,
      message: "Redirect the customer to the Nagad (simulated) payment page",
      redirectUrl,
      providerPaymentId: reference,
      providerReference: order.orderNumber,
      providerResponse: toJson({
        simulation: true,
        reference,
        status: "INITIALIZED",
        callBackUrl: redirectUrl,
        amount,
      }),
    };
  },

  async verify(
    payment: PaymentVerificationContext,
    callbackData,
  ): Promise<ProviderVerificationResult> {
    const callbackReference =
      callbackData.payment_ref_id?.trim() ||
      callbackData.paymentReferenceId?.trim();

    if (!callbackReference) {
      throw ApiError.badRequest(
        "Nagad simulation callback is missing the payment reference id",
      );
    }

    if (
      payment.providerPaymentId &&
      callbackReference !== payment.providerPaymentId
    ) {
      throw ApiError.badRequest(
        "Nagad simulation reference does not match this order",
      );
    }

    const status = getString(callbackData.status).toLowerCase();
    const providerResponse = (result: JsonObject): Prisma.InputJsonValue =>
      toJson({
        simulation: true,
        reference: callbackReference,
        status: callbackData.status ?? "",
        ...result,
      });

    if (["success", "successful", "completed", "paid"].includes(status)) {
      return {
        status: "PAID",
        transactionId: `SIMTXN-${callbackReference.replace(NAGAD_SIMULATION_PREFIX, "")}`,
        providerPaymentId: callbackReference,
        providerReference: payment.orderNumber,
        providerResponse: providerResponse({ outcome: "PAID" }),
        rawStatus: getString(callbackData.status, "Success"),
      };
    }

    if (["aborted", "cancelled", "canceled", "cancel", "failed"].includes(status)) {
      return {
        status: "CANCELLED",
        providerPaymentId: callbackReference,
        providerResponse: providerResponse({ outcome: "CANCELLED" }),
        rawStatus: getString(callbackData.status, "Aborted"),
      };
    }

    return {
      status: "PENDING",
      providerPaymentId: callbackReference,
      providerResponse: providerResponse({ outcome: "PENDING" }),
      rawStatus: getString(callbackData.status, "Pending"),
    };
  },
};
