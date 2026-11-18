import "./helpers/test-env";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { PaymentStatus } from "@prisma/client";
import {
  cardProvider,
  verifyStripeWebhookSignature,
} from "../src/modules/payment/providers/card.provider";
import { cardConfig } from "../src/config/payment.config";
import { ApiError } from "../src/utils/ApiError";
import type { OrderResponse } from "../src/types/order.types";
import type { PaymentVerificationContext } from "../src/modules/payment/payment-provider.types";
import { installFetchMock, jsonResponse, rawResponse } from "./helpers/http";

const makeOrder = (): OrderResponse =>
  ({
    id: "order-1",
    orderNumber: "ORD-1",
    totalAmount: 100,
  }) as unknown as OrderResponse;

const context = (): PaymentVerificationContext => ({
  orderId: "order-1",
  orderNumber: "ORD-1",
  amount: "100.00",
  providerPaymentId: "pi_1",
});

const intent = (overrides: Record<string, unknown> = {}) => ({
  id: "pi_1",
  object: "payment_intent",
  status: "succeeded",
  amount: 10000,
  currency: "bdt",
  client_secret: "pi_1_secret",
  latest_charge: "ch_1",
  metadata: { orderId: "order-1", orderNumber: "ORD-1" },
  ...overrides,
});

const installIntent = (
  t: Parameters<typeof installFetchMock>[0],
  body: Record<string, unknown>,
  status = 200,
) =>
  installFetchMock(t, (request) => {
    if (request.url.endsWith("/v1/payment_intents/pi_1")) {
      return jsonResponse(body, status);
    }

    throw new Error(`Unexpected Stripe request: ${request.url}`);
  });

test("Stripe creates a PaymentIntent with the order amount and metadata", async (t) => {
  const requests = installFetchMock(t, (request) => {
    if (request.url.endsWith("/v1/payment_intents")) {
      return jsonResponse({
        id: "pi_1",
        status: "requires_payment_method",
        amount: 10000,
        currency: "bdt",
        client_secret: "pi_1_secret",
      });
    }

    throw new Error(`Unexpected Stripe request: ${request.url}`);
  });

  const result = await cardProvider.initiate(makeOrder());

  assert.equal(result.clientSecret, "pi_1_secret");
  assert.equal(result.providerPaymentId, "pi_1");
  assert.equal(result.paymentStatus, PaymentStatus.PROCESSING);

  const create = requests.find((request) =>
    request.url.endsWith("/v1/payment_intents"),
  );
  assert.ok(create);
  assert.equal(create.headers.Authorization, "Bearer sk_test_unit_test_dummy");

  const body = new URLSearchParams(create.body ?? "");
  assert.equal(body.get("amount"), "10000");
  assert.equal(body.get("currency"), "bdt");
  assert.equal(body.get("metadata[orderId]"), "order-1");
  assert.equal(body.get("metadata[orderNumber]"), "ORD-1");
  assert.equal(body.get("automatic_payment_methods[enabled]"), "true");
});

test("Stripe verification marks a succeeded intent as PAID", async (t) => {
  installIntent(t, intent());

  const result = await cardProvider.verify(context(), {
    paymentIntentId: "pi_1",
  });

  assert.equal(result.status, "PAID");
  assert.equal(result.transactionId, "pi_1");
  assert.equal(result.providerReference, "ch_1");
});

test("Stripe never marks processing or requires_action as PAID", async (t) => {
  installIntent(
    t,
    intent({ status: "requires_action", latest_charge: null }),
  );

  const result = await cardProvider.verify(context(), {
    paymentIntentId: "pi_1",
  });

  assert.equal(result.status, "PENDING");
  assert.equal(result.rawStatus, "requires_action");
  assert.equal(result.clientSecret, "pi_1_secret");
});

test("Stripe maps a canceled intent to CANCELLED", async (t) => {
  installIntent(t, intent({ status: "canceled" }));

  const result = await cardProvider.verify(context(), {
    paymentIntentId: "pi_1",
  });

  assert.equal(result.status, "CANCELLED");
});

test("Stripe rejects a PaymentIntent with a different amount", async (t) => {
  installIntent(t, intent({ amount: 5000 }));

  await assert.rejects(
    () =>
      cardProvider.verify(context(), {
        paymentIntentId: "pi_1",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      /amount does not match/.test(error.message),
  );
});

test("Stripe rejects a PaymentIntent belonging to another order", async (t) => {
  installIntent(
    t,
    intent({ metadata: { orderId: "another-order" } }),
  );

  await assert.rejects(
    () =>
      cardProvider.verify(context(), {
        paymentIntentId: "pi_1",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      /does not belong to this order/.test(error.message),
  );
});

const sign = (payload: string, timestamp: number): string => {
  if (!cardConfig.webhookSecret) {
    throw new Error("Test webhook secret missing");
  }

  return createHmac("sha256", cardConfig.webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
};

test("Stripe webhook signature accepts an authentic event", () => {
  const payload = JSON.stringify({
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_1", metadata: { orderId: "order-1" } } },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(payload, timestamp);

  const event = verifyStripeWebhookSignature(
    Buffer.from(payload, "utf8"),
    `t=${timestamp},v1=${signature}`,
  );

  assert.equal(event.id, "evt_1");
  assert.equal(event.type, "payment_intent.succeeded");
});

test("Stripe webhook signature rejects a tampered payload", () => {
  const payload = JSON.stringify({
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_1" } },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(payload, timestamp);
  const tampered = payload.replace("pi_1", "pi_evil");

  assert.throws(
    () =>
      verifyStripeWebhookSignature(
        Buffer.from(tampered, "utf8"),
        `t=${timestamp},v1=${signature}`,
      ),
    (error: unknown) =>
      error instanceof ApiError && error.statusCode === 401,
  );
});

test("Stripe webhook signature rejects a stale event", () => {
  const payload = JSON.stringify({
    id: "evt_old",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_1" } },
  });
  const timestamp = Math.floor(Date.now() / 1000) - 600;
  const signature = sign(payload, timestamp);

  assert.throws(
    () =>
      verifyStripeWebhookSignature(
        Buffer.from(payload, "utf8"),
        `t=${timestamp},v1=${signature}`,
      ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 401 &&
      /tolerance/.test(error.message),
  );
});

test("Stripe webhook signature rejects malformed JSON with a 400", () => {
  const payload = '{"id":"evt_1",';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(payload, timestamp);

  assert.throws(
    () =>
      verifyStripeWebhookSignature(
        Buffer.from(payload, "utf8"),
        `t=${timestamp},v1=${signature}`,
      ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      /payload/.test(error.message),
  );
});

test("Stripe webhook signature requires the signature header", () => {
  assert.throws(
    () => verifyStripeWebhookSignature(Buffer.from("{}", "utf8"), undefined),
    (error: unknown) =>
      error instanceof ApiError && error.statusCode === 401,
  );
});

// Keep the raw response helper referenced so accidental deletions of the
// malformed-body coverage are visible during review.
void rawResponse;
