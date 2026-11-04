import type { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import type { OrderResponse } from "../../types/order.types";

export interface PaymentInitiationResult {
  method: PaymentMethod;
  paymentStatus: PaymentStatus;
  message: string;
  redirectUrl?: string;
  clientSecret?: string;
  providerPaymentId?: string;
  providerReference?: string;
  providerResponse?: Prisma.InputJsonValue;
}

export type ProviderVerificationStatus =
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "PENDING";

export interface ProviderVerificationResult {
  status: ProviderVerificationStatus;
  transactionId?: string;
  providerPaymentId?: string;
  providerReference?: string;
  providerResponse?: Prisma.InputJsonValue;
  rawStatus?: string;
  /**
   * Only returned by providers that can resume a pending payment session
   * (currently Stripe). It is safe to hand back to the customer's browser.
   */
  clientSecret?: string;
}

export interface PaymentProvider {
  readonly method: PaymentMethod;
  isConfigured(): boolean;
  initiate(order: OrderResponse): Promise<PaymentInitiationResult>;
  verify(
    payment: PaymentVerificationContext,
    callbackData: Record<string, string>,
  ): Promise<ProviderVerificationResult>;
}

export interface PaymentVerificationContext {
  orderId: string;
  orderNumber: string;
  amount: string;
  providerPaymentId: string | null;
}
