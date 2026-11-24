import { Role, UserStatus } from "@prisma/client";

import { env } from "../../config/env";
import { getFrontendOrigin } from "../../config/origins";
import { isMailConfigured, sendMail } from "../../config/mailer";
import { prisma } from "../../config/prisma";
import { safeErrorSummary } from "../../utils/redact";
import { ORDER_PLACED_EVENT } from "./notification-events";

/**
 * Out-of-band alerts for new orders. The in-app notification is committed with
 * the order; everything here runs *after* the transaction and is best-effort.
 * Add another channel by pushing one more task into `channels` below (SMS,
 * WhatsApp, Telegram or a push provider can all consume the same payload).
 */
export interface OrderNotificationOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: Date;
  /** Guest orders need the `guest` flag so the storefront reloads its token. */
  guestToken?: string | null;
  user: { name: string; email: string };
  items?: Array<{
    productName: string;
    quantity: number;
    size: string | null;
    totalPrice: number;
  }>;
}

export interface OrderNotificationPayload {
  event: typeof ORDER_PLACED_EVENT;
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  createdAt: string;
  storefrontUrl: string;
  orderUrl: string;
  customer: { name: string; email: string };
  items: Array<{
    name: string;
    quantity: number;
    size: string | null;
    totalPrice: number;
  }>;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildPayload = (order: OrderNotificationOrder): OrderNotificationPayload => {
  const storefrontUrl = getFrontendOrigin().replace(/\/+$/, "");

  return {
    event: ORDER_PLACED_EVENT,
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    currency: env.STORE_CURRENCY,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt.toISOString(),
    storefrontUrl,
    orderUrl: `${storefrontUrl}/account/orders/${encodeURIComponent(order.id)}${order.guestToken ? "?guest=1" : ""}`,
    customer: {
      name: order.user.name,
      email: order.user.email,
    },
    items: (order.items ?? []).map((item) => ({
      name: item.productName,
      quantity: item.quantity,
      size: item.size,
      totalPrice: item.totalPrice,
    })),
  };
};

const buildMessage = (payload: OrderNotificationPayload): { text: string; html: string } => {
  const lines = payload.items
    .map(
      (item) =>
        `${item.quantity} × ${item.name}${item.size ? ` (${item.size})` : ""} — ${payload.currency} ${item.totalPrice.toFixed(2)}`,
    )
    .join("\n");

  const text = [
    `New order ${payload.orderNumber}`,
    `Customer: ${payload.customer.name} <${payload.customer.email}>`,
    `Payment: ${payload.paymentMethod}`,
    `Total: ${payload.currency} ${payload.totalAmount.toFixed(2)}`,
    `Order: ${payload.orderUrl}`,
    "",
    lines,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<h2>New order ${escapeHtml(payload.orderNumber)}</h2>
<p><strong>Customer:</strong> ${escapeHtml(payload.customer.name)} (${escapeHtml(payload.customer.email)})</p>
<p><strong>Payment:</strong> ${escapeHtml(payload.paymentMethod)}</p>
<p><strong>Total:</strong> ${escapeHtml(payload.currency)} ${payload.totalAmount.toFixed(2)}</p>
<p><a href="${escapeHtml(payload.orderUrl)}">View order</a></p>
<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(lines)}</pre>`;

  return { text, html };
};

const sendOrderEmail = async (
  payload: OrderNotificationPayload,
): Promise<void> => {
  if (!isMailConfigured) return;

  const admins = await prisma.user.findMany({
    where: {
      role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
      status: UserStatus.ACTIVE,
      isActive: true,
      deletedAt: null,
      email: { not: payload.customer.email },
    },
    select: { email: true },
  });

  const recipients = [
    ...new Set([...admins.map((admin) => admin.email), payload.customer.email]),
  ].filter(Boolean);

  if (recipients.length === 0) return;

  const message = buildMessage(payload);

  await Promise.all(
    recipients.map((to) =>
      sendMail({
        to,
        subject: `New order ${payload.orderNumber} — ${env.STORE_NAME}`,
        text: message.text,
        html: message.html,
      }),
    ),
  );
};

const postWebhook = async (
  channel: string,
  url: string | undefined,
  payload: OrderNotificationPayload,
): Promise<void> => {
  if (!url) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (env.ORDER_NOTIFICATION_WEBHOOK_SECRET) {
    headers["x-webhook-secret"] = env.ORDER_NOTIFICATION_WEBHOOK_SECRET;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, channel }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`${channel} webhook responded with HTTP ${response.status}`);
  }
};

/**
 * Fires every configured external channel. Never throws: a broken mail host
 * or webhook must not fail a checkout that already succeeded.
 */
export const notifyExternalOrderChannels = async (
  order: OrderNotificationOrder,
): Promise<void> => {
  const payload = buildPayload(order);
  const webhookChannels: Array<[string, string | undefined]> = [
    ["webhook", env.ORDER_NOTIFICATION_WEBHOOK_URL],
    ["sms", env.ORDER_NOTIFICATION_SMS_WEBHOOK_URL],
    ["whatsapp", env.ORDER_NOTIFICATION_WHATSAPP_WEBHOOK_URL],
    ["telegram", env.ORDER_NOTIFICATION_TELEGRAM_WEBHOOK_URL],
    ["push", env.ORDER_NOTIFICATION_PUSH_WEBHOOK_URL],
  ];
  const channels: Array<[string, () => Promise<void>]> = [
    ["email", () => sendOrderEmail(payload)],
    ...webhookChannels
      .filter(([, url]) => Boolean(url))
      .map(
        ([channel, url]) =>
          [channel, () => postWebhook(channel, url, payload)] as [
            string,
            () => Promise<void>,
          ],
      ),
  ];

  await Promise.all(
    channels.map(async ([name, deliver]) => {
      try {
        await deliver();
      } catch (error) {
        console.error(`[notifications] ${name} order notification failed`, {
          orderId: order.id,
          error: safeErrorSummary(error),
        });
      }
    }),
  );
};
