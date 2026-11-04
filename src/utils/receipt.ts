import { randomUUID } from "node:crypto";
import { PaymentMethod } from "@prisma/client";
import { env } from "../config/env";
import type { OrderResponse, ReceiptData } from "../types/order.types";

const TRANSACTION_PREFIXES: Record<PaymentMethod, string> = {
  [PaymentMethod.BKASH]: "BKASH",
  [PaymentMethod.NAGAD]: "NAGAD",
  [PaymentMethod.CARD]: "CARD",
  [PaymentMethod.CASH_ON_DELIVERY]: "COD",
};

export const generateTransactionId = (method: PaymentMethod): string => {
  const randomPart = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `${TRANSACTION_PREFIXES[method]}-${Date.now()}-${randomPart}`;
};

export const buildReceiptUrl = (orderId: string): string => {
  const path = `/api/v1/orders/${orderId}/receipt`;
  const baseUrl = env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}${path}` : path;
};

export const buildReceipt = (order: OrderResponse): ReceiptData => {
  return {
    receiptNumber: order.receiptNumber ?? order.orderNumber,
    orderNumber: order.orderNumber,
    issuedAt: order.createdAt,
    store: {
      name: env.STORE_NAME,
      address: env.STORE_ADDRESS,
      phone: env.STORE_PHONE,
      email: env.STORE_EMAIL,
      currency: env.STORE_CURRENCY,
    },
    customer: order.customer,
    shippingAddress: order.address,
    items: order.items.map((item) => ({
      productName: item.productName,
      productImage: item.productImage,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    })),
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          transactionId: order.payment.transactionId,
          paidAt: order.payment.paidAt,
        }
      : null,
    totals: {
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingCost: order.shippingCost,
      totalAmount: order.totalAmount,
      currency: env.STORE_CURRENCY,
    },
  };
};
