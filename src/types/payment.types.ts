import type { PaymentMethod, PaymentStatus } from "@prisma/client";

/** Dashboard-controlled switches persisted in the SiteSettings singleton. */
export interface PaymentProviderToggles {
  codEnabled: boolean;
  bkashEnabled: boolean;
  nagadEnabled: boolean;
  stripeEnabled: boolean;
}

/** Public provider status returned by GET /api/v1/payments/providers. */
export interface PaymentProviderStatus {
  bkash: boolean;
  nagad: boolean;
  card: boolean;
  cashOnDelivery: boolean;
  cardPublishableKey: string | null;
  cardCurrency: string;
}

export interface InitiatePaymentInput {
  orderId: string;
  method?: PaymentMethod;
}

/** Public guest payment input. The token replaces the bearer authentication. */
export interface GuestInitiatePaymentInput extends InitiatePaymentInput {
  guestToken: string;
}

export interface GuestReconcileCardPaymentInput {
  orderId: string;
  guestToken: string;
}

export interface InitiatePaymentResult {
  payment: PaymentResponse;
  method: PaymentMethod;
  paymentStatus: PaymentStatus;
  message: string;
  redirectUrl?: string;
  /** Canonical bKash checkout URL field, mirrored to the storefront client. */
  bkashURL?: string | null;
  clientSecret?: string;
  providerPaymentId?: string | null;
}

export interface ConfirmPaymentInput {
  transactionId?: string;
  providerReference?: string;
}

export interface FailPaymentInput {
  reason?: string;
}

export interface PaymentWebhookInput {
  orderId: string;
  status: "PAID" | "FAILED";
  transactionId?: string;
  providerReference?: string;
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  transactionId: string | null;
  providerPaymentId: string | null;
  providerReference: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}
