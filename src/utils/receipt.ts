import { randomUUID } from "node:crypto";
import { PaymentMethod } from "@prisma/client";
import { env } from "../config/env";
import { getBackendOrigin } from "../config/origins";
import { getReceiptSettings } from "../modules/settings/receipt-settings.service";
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
  const path = `/api/v1/orders/${encodeURIComponent(orderId)}/receipt`;
  const baseUrl = getBackendOrigin().replace(/\/+$/, "");
  return `${baseUrl}${path}`;
};

export const buildReceipt = async (order: OrderResponse): Promise<ReceiptData> => {
  // Settings are read at receipt time so saved branding/toggles apply
  // immediately to both live views and freshly generated PDFs/prints.
  const settings = await getReceiptSettings();

  return {
    receiptNumber: order.receiptNumber ?? order.orderNumber,
    orderNumber: order.orderNumber,
    issuedAt: order.createdAt,
    store: {
      name: settings.storeName,
      tagline: settings.tagline,
      logoUrl: settings.showLogo ? settings.logoUrl : null,
      footerNote: settings.footerNote ?? "Thank you for shopping with us.",
      address: settings.contactAddress ?? env.STORE_ADDRESS,
      phone: settings.contactPhone ?? env.STORE_PHONE,
      email: settings.contactEmail ?? env.STORE_EMAIL,
      currency: env.STORE_CURRENCY,
    },
    display: {
      showLogo: settings.showLogo,
      showSize: settings.showSize,
      showColor: settings.showColor,
      showPaymentMethod: settings.showPaymentMethod,
      showTransactionId: settings.showTransactionId,
      showCustomer: settings.showCustomer,
      showShippingAddress: settings.showShippingAddress,
    },
    customer: order.customer,
    shippingAddress: order.address,
    items: order.items.map((item) => ({
      productName: item.productName,
      productImage: item.productImage,
      size: item.size,
      color: item.color,
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
