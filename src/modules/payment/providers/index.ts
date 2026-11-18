import { PaymentMethod } from "@prisma/client";
import { isNagadSimulationEnabled } from "../../../config/payment.config";
import { bkashProvider } from "./bkash.provider";
import { cardProvider } from "./card.provider";
import { nagadProvider } from "./nagad.provider";
import { simulationNagadProvider } from "./nagad-simulation.provider";
import type { PaymentProvider } from "../payment-provider.types";

const providers: Partial<Record<PaymentMethod, PaymentProvider>> = {
  [PaymentMethod.BKASH]: bkashProvider,
  [PaymentMethod.NAGAD]: nagadProvider,
  [PaymentMethod.CARD]: cardProvider,
};

export const getPaymentProvider = (
  method: PaymentMethod,
): PaymentProvider | undefined => {
  // The dev-only simulation takes precedence for Nagad so the whole flow can be
  // exercised without the live sandbox. It can never activate in production.
  if (method === PaymentMethod.NAGAD && isNagadSimulationEnabled()) {
    return simulationNagadProvider;
  }

  return providers[method];
};

export { bkashProvider, nagadProvider, simulationNagadProvider, cardProvider };
