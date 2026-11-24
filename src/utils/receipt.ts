import { randomUUID } from "node:crypto";
import { PaymentMethod } from "@prisma/client";
import { env } from "../config/env";
import { getBackendOrigin } from "../config/origins";
import { getReceiptSettings } from "../modules/settings/receipt-settings.service";
import { getSettings } from "../modules/settings/settings.service";
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
  const [receiptSettings, siteSettings] = await Promise.all([
    getReceiptSettings(),
    getSettings(),
  ]);

  return {
    receiptNumber: order.receiptNumber ?? order.orderNumber,
    orderNumber: order.orderNumber,
    issuedAt: order.createdAt,
    store: {
      // Store identity follows the dashboard site settings first, then any
      // receipt-specific branding, then the server environment default.
      name: siteSettings.siteName || receiptSettings.storeName || env.STORE_NAME,
      tagline: receiptSettings.tagline,
      logoUrl: receiptSettings.showLogo ? receiptSettings.logoUrl : null,
      footerNote: receiptSettings.footerNote ?? "Thank you for shopping with us.",
      address: receiptSettings.contactAddress ?? env.STORE_ADDRESS,
      phone: receiptSettings.contactPhone ?? env.STORE_PHONE,
      email: receiptSettings.contactEmail ?? env.STORE_EMAIL,
      currency: env.STORE_CURRENCY,
    },
    display: {
      showLogo: receiptSettings.showLogo,
      showSize: receiptSettings.showSize,
      showColor: receiptSettings.showColor,
      showPaymentMethod: receiptSettings.showPaymentMethod,
      showTransactionId: receiptSettings.showTransactionId,
      showCustomer: receiptSettings.showCustomer,
      showShippingAddress: receiptSettings.showShippingAddress,
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
