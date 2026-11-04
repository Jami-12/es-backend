import type { PaymentMethod, PaymentStatus } from "@prisma/client";

export interface InitiatePaymentInput {
  orderId: string;
  method?: PaymentMethod;
}

export interface InitiatePaymentResult {
  payment: PaymentResponse;
  method: PaymentMethod;
  paymentStatus: PaymentStatus;
  message: string;
  redirectUrl?: string;
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
