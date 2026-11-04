import { PaymentMethod } from "@prisma/client";
import { bkashProvider } from "./bkash.provider";
import { cardProvider } from "./card.provider";
import { nagadProvider } from "./nagad.provider";
import type { PaymentProvider } from "../payment-provider.types";

const providers: Partial<Record<PaymentMethod, PaymentProvider>> = {
  [PaymentMethod.BKASH]: bkashProvider,
  [PaymentMethod.NAGAD]: nagadProvider,
  [PaymentMethod.CARD]: cardProvider,
};

export const getPaymentProvider = (
  method: PaymentMethod,
): PaymentProvider | undefined => providers[method];

export { bkashProvider, nagadProvider, cardProvider };
