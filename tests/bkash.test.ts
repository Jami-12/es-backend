import "./helpers/test-env";

import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentMethod, PaymentStatus } from "@prisma/client";
import {
  bkashProvider,
  resetBkashTokenCache,
} from "../src/modules/payment/providers/bkash.provider";
import { ApiError } from "../src/utils/ApiError";
import type { OrderResponse } from "../src/types/order.types";
import type { PaymentVerificationContext } from "../src/modules/payment/payment-provider.types";
import {
  installFetchMock,
  jsonResponse,
  rawResponse,
} from "./helpers/http";

const makeOrder = (): OrderResponse =>
  ({
    id: "order-1",
    orderNumber: "ORD-1",
    totalAmount: 100,
    customer: {
      id: "user-1",
      name: "Test Customer",
      email: "customer@example.com",
      phone: "01700000000",
    },
  }) as unknown as OrderResponse;

const makeContext = (): PaymentVerificationContext => ({
  orderId: "order-1",
  orderNumber: "ORD-1",
  amount: "100.00",
  providerPaymentId: "PAY-1",
});

const completedPayment = (overrides: Record<string, unknown> = {}) => ({
  statusCode: "0000",
  statusMessage: "Successful",
  paymentID: "PAY-1",
  trxID: "TRX-1",
  transactionStatus: "Completed",
  amount: "100.00",
  currency: "BDT",
  merchantInvoiceNumber: "ORD-1",
  ...overrides,
});

test("bKash grant token and create payment return the sandbox redirect URL", async (t) => {
  resetBkashTokenCache();

  const requests = installFetchMock(t, (request) => {
    if (request.url.includes("/tokenized/checkout/token/grant")) {
      return jsonResponse({ id_token: "token-1", expires_in: "3600" });
    }

    if (request.url.endsWith("/tokenized/checkout/create")) {
      return jsonResponse({
        statusCode: "0000",
        statusMessage: "Successful",
        paymentID: "PAY-1",
        bkashURL: "https://sandbox.bka.sh/checkout/PAY-1",
      });
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  const result = await bkashProvider.initiate(makeOrder());

  assert.equal(result.method, PaymentMethod.BKASH);
  assert.equal(result.paymentStatus, PaymentStatus.PROCESSING);
  assert.equal(result.providerPaymentId, "PAY-1");
  assert.equal(
    result.redirectUrl,
    "https://sandbox.bka.sh/checkout/PAY-1",
  );

  const grant = requests.find((request) =>
    request.url.includes("/token/grant"),
  );
  assert.ok(grant);
  assert.equal(grant.method, "POST");
  assert.equal(grant.headers.username, "unit-test-bkash-user");
  assert.equal(grant.headers.password, "unit-test-bkash-password");
  assert.deepEqual(JSON.parse(grant.body ?? "{}"), {
    app_key: "unit-test-bkash-app-key",
    app_secret: "unit-test-bkash-app-secret",
  });

  const create = requests.find((request) =>
    request.url.endsWith("/create"),
  );
  assert.ok(create);
  assert.equal(create.headers.Authorization, "token-1");
  assert.equal(create.headers["X-APP-Key"], "unit-test-bkash-app-key");

  const payload = JSON.parse(create.body ?? "{}");
  assert.equal(payload.amount, "100.00");
  assert.equal(payload.currency, "BDT");
  assert.equal(payload.intent, "sale");
  assert.equal(payload.mode, "0011");
  assert.equal(payload.merchantInvoiceNumber, "ORD-1");
  assert.match(payload.callbackURL, /orderId=order-1/);
});

test("concurrent bKash checkouts share one token grant", async (t) => {
  resetBkashTokenCache();

  let tokenGrants = 0;

  installFetchMock(t, async (request) => {
    if (request.url.includes("/token/grant")) {
      tokenGrants += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return jsonResponse({ id_token: "token-1", expires_in: 3600 });
    }

    if (request.url.endsWith("/create")) {
      return jsonResponse({
        statusCode: "0000",
        paymentID: "PAY-1",
        bkashURL: "https://sandbox.bka.sh/checkout/PAY-1",
      });
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  const [first, second] = await Promise.all([
    bkashProvider.initiate(makeOrder()),
    bkashProvider.initiate(makeOrder()),
  ]);

  assert.equal(tokenGrants, 1);
  assert.equal(first.providerPaymentId, "PAY-1");
  assert.equal(second.providerPaymentId, "PAY-1");
});

test("bKash successful callback executes and verifies the payment", async (t) => {
  resetBkashTokenCache();

  const requests = installFetchMock(t, (request) => {
    if (request.url.includes("/token/grant")) {
      return jsonResponse({ id_token: "token-1", expires_in: 3600 });
    }

    if (request.url.endsWith("/tokenized/checkout/execute")) {
      return jsonResponse(completedPayment());
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  const result = await bkashProvider.verify(makeContext(), {
    paymentID: "PAY-1",
    status: "success",
  });

  assert.equal(result.status, "PAID");
  assert.equal(result.transactionId, "TRX-1");
  assert.equal(result.providerPaymentId, "PAY-1");
  assert.ok(requests.some((request) => request.url.endsWith("/execute")));
  assert.ok(!requests.some((request) => request.url.includes("/query/")));
});

test("bKash rejects a completed payment with a different amount", async (t) => {
  resetBkashTokenCache();

  installFetchMock(t, (request) => {
    if (request.url.includes("/token/grant")) {
      return jsonResponse({ id_token: "token-1", expires_in: 3600 });
    }

    if (request.url.endsWith("/execute")) {
      return jsonResponse(completedPayment({ amount: "99.00" }));
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  await assert.rejects(
    () =>
      bkashProvider.verify(makeContext(), {
        paymentID: "PAY-1",
        status: "success",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      /amount does not match/.test(error.message),
  );
});

test("bKash never trusts a cancel query parameter and queries the gateway", async (t) => {
  resetBkashTokenCache();

  const requests = installFetchMock(t, (request) => {
    if (request.url.includes("/token/grant")) {
      return jsonResponse({ id_token: "token-1", expires_in: 3600 });
    }

    if (request.url.includes("/payment/query/PAY-1")) {
      return jsonResponse({
        statusCode: "0000",
        paymentID: "PAY-1",
        transactionStatus: "Initiated",
        amount: "100.00",
        currency: "BDT",
        merchantInvoiceNumber: "ORD-1",
      });
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  const result = await bkashProvider.verify(makeContext(), {
    paymentID: "PAY-1",
    status: "cancel",
  });

  assert.equal(result.status, "PENDING");
  assert.ok(!requests.some((request) => request.url.endsWith("/execute")));
  assert.ok(requests.some((request) => request.url.includes("/query/PAY-1")));
});

test("bKash maps an authoritative cancelled status to CANCELLED", async (t) => {
  resetBkashTokenCache();

  installFetchMock(t, (request) => {
    if (request.url.includes("/token/grant")) {
      return jsonResponse({ id_token: "token-1", expires_in: 3600 });
    }

    if (request.url.includes("/query/PAY-1")) {
      return jsonResponse({
        statusCode: "0000",
        paymentID: "PAY-1",
        transactionStatus: "Cancelled",
        amount: "100.00",
        currency: "BDT",
        merchantInvoiceNumber: "ORD-1",
      });
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  const result = await bkashProvider.verify(makeContext(), {
    paymentID: "PAY-1",
    status: "cancel",
  });

  assert.equal(result.status, "CANCELLED");
});

test("bKash maps a declined status to FAILED even when statusCode is 0000", async (t) => {
  resetBkashTokenCache();

  installFetchMock(t, (request) => {
    if (request.url.includes("/token/grant")) {
      return jsonResponse({ id_token: "token-1", expires_in: 3600 });
    }

    if (request.url.includes("/query/PAY-1")) {
      return jsonResponse({
        statusCode: "0000",
        statusMessage: "Payment declined by the issuer",
        paymentID: "PAY-1",
        transactionStatus: "Failed",
        amount: "100.00",
        currency: "BDT",
        merchantInvoiceNumber: "ORD-1",
      });
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  const result = await bkashProvider.verify(makeContext(), {
    paymentID: "PAY-1",
    status: "cancel",
  });

  assert.equal(result.status, "FAILED");
});

test("duplicate bKash callbacks produce the same verified result", async (t) => {
  resetBkashTokenCache();

  let executeCount = 0;
  installFetchMock(t, (request) => {
    if (request.url.includes("/token/grant")) {
      return jsonResponse({ id_token: "token-1", expires_in: 3600 });
    }

    if (request.url.endsWith("/execute")) {
      executeCount += 1;
      return jsonResponse(completedPayment());
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  const first = await bkashProvider.verify(makeContext(), {
    paymentID: "PAY-1",
    status: "success",
  });
  const second = await bkashProvider.verify(makeContext(), {
    paymentID: "PAY-1",
    status: "success",
  });

  assert.equal(first.status, "PAID");
  assert.equal(second.status, "PAID");
  assert.equal(second.transactionId, first.transactionId);
  assert.equal(executeCount, 2);
});

test("bKash refreshes a rejected cached token once", async (t) => {
  resetBkashTokenCache();
  t.mock.method(console, "warn", () => undefined);

  let tokenGrants = 0;
  let createCalls = 0;

  installFetchMock(t, (request) => {
    if (request.url.includes("/token/grant")) {
      tokenGrants += 1;
      return jsonResponse({
        id_token: `token-${tokenGrants}`,
        expires_in: 3600,
      });
    }

    if (request.url.endsWith("/create")) {
      createCalls += 1;

      if (createCalls === 1) {
        return jsonResponse(
          { statusCode: "401", statusMessage: "Unauthorized" },
          401,
        );
      }

      return jsonResponse({
        statusCode: "0000",
        paymentID: "PAY-1",
        bkashURL: "https://sandbox.bka.sh/checkout/PAY-1",
      });
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  const result = await bkashProvider.initiate(makeOrder());

  assert.equal(result.providerPaymentId, "PAY-1");
  assert.equal(tokenGrants, 2);
  assert.equal(createCalls, 2);
});

test("malformed bKash create response is a controlled 502, not a SyntaxError", async (t) => {
  resetBkashTokenCache();
  t.mock.method(console, "warn", () => undefined);

  installFetchMock(t, (request) => {
    if (request.url.includes("/token/grant")) {
      return jsonResponse({ id_token: "token-1", expires_in: 3600 });
    }

    if (request.url.endsWith("/create")) {
      return rawResponse(
        '{ "statusCode": "0000",\n "paymentID": "PAY-1"',
        200,
        "application/json",
      );
    }

    throw new Error(`Unexpected bKash request: ${request.url}`);
  });

  await assert.rejects(
    () => bkashProvider.initiate(makeOrder()),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 502 &&
      !(error instanceof SyntaxError),
  );
});
