import { PaymentMethod } from "@prisma/client";

import { paymentProviderStatus } from "../../config/payment.config";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type {
  PaymentProviderStatus,
  PaymentProviderToggles,
} from "../../types/payment.types";

const DEFAULT_TOGGLES: PaymentProviderToggles = {
  codEnabled: true,
  bkashEnabled: true,
  nagadEnabled: true,
  stripeEnabled: true,
};

type ProviderStatusKey = "cashOnDelivery" | "bkash" | "nagad" | "card";

const METHOD_STATUS: Record<PaymentMethod, ProviderStatusKey> = {
  [PaymentMethod.CASH_ON_DELIVERY]: "cashOnDelivery",
  [PaymentMethod.BKASH]: "bkash",
  [PaymentMethod.NAGAD]: "nagad",
  [PaymentMethod.CARD]: "card",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH_ON_DELIVERY]: "Cash on delivery",
  [PaymentMethod.BKASH]: "bKash",
  [PaymentMethod.NAGAD]: "Nagad",
  [PaymentMethod.CARD]: "Card",
};

/**
 * Reads the dashboard switches without creating/updating the settings row.
 * Public checkout and provider endpoints must not write to the database.
 */
export const getPaymentProviderToggles =
  async (): Promise<PaymentProviderToggles> => {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        codEnabled: true,
        bkashEnabled: true,
        nagadEnabled: true,
        stripeEnabled: true,
      },
    });

    return settings ?? DEFAULT_TOGGLES;
  };

/**
 * Merges dashboard switches with environment capability. Env configuration is
 * a hard cap: a method can never appear enabled here unless both its credentials
 * and its dashboard toggle are on.
 */
export const getEffectivePaymentProviderStatus =
  async (): Promise<PaymentProviderStatus> => {
    const [capabilities, toggles] = await Promise.all([
      Promise.resolve(paymentProviderStatus()),
      getPaymentProviderToggles(),
    ]);

    return {
      ...capabilities,
      cashOnDelivery: capabilities.cashOnDelivery && toggles.codEnabled,
      bkash: capabilities.bkash && toggles.bkashEnabled,
      nagad: capabilities.nagad && toggles.nagadEnabled,
      card: capabilities.card && toggles.stripeEnabled,
    };
  };

/**
 * Authoritative server-side check. Hiding a method in the UI is cosmetic; every
 * checkout and payment initiation path must call this so direct API calls cannot
 * bypass a disabled method.
 */
export const assertPaymentMethodAvailable = async (
  method: PaymentMethod,
): Promise<void> => {
  const status = await getEffectivePaymentProviderStatus();

  if (!status[METHOD_STATUS[method]]) {
    throw new ApiError(
      503,
      `${METHOD_LABEL[method]} payments are currently unavailable. Please choose another payment method.`,
    );
  }
};
