import "./helpers/test-env";

import assert from "node:assert/strict";
import { test } from "node:test";
import { nagadProvider } from "../src/modules/payment/providers/nagad.provider";
import { ApiError } from "../src/utils/ApiError";
import type { PaymentVerificationContext } from "../src/modules/payment/payment-provider.types";
import { installFetchMock, jsonResponse } from "./helpers/http";

const context = (): PaymentVerificationContext => ({
  orderId: "order-1",
  orderNumber: "ORD-1",
  amount: "100.00",
  providerPaymentId: "NREF-1",
});

const verifiedPayment = (overrides: Record<string, unknown> = {}) => ({
  paymentReferenceId: "NREF-1",
  status: "Success",
  statusCode: "000",
  message: "Payment Successful",
  amount: "100.00",
  currencyCode: "050",
  issuerPaymentRefNo: "ISSUER-1",
  ...overrides,
});

const installVerification = (
  t: Parameters<typeof installFetchMock>[0],
  body: Record<string, unknown>,
  status = 200,
) =>
  installFetchMock(t, (request) => {
    if (request.url.includes("/verify/payment/NREF-1")) {
      return jsonResponse(body, status);
    }

    throw new Error(`Unexpected Nagad request: ${request.url}`);
  });

test("Nagad verifies a successful payment using the verify endpoint", async (t) => {
  const requests = installVerification(t, verifiedPayment());

  const result = await nagadProvider.verify(context(), {
    payment_ref_id: "NREF-1",
    order_id: "order-1",
    status: "Success",
  });

  assert.equal(result.status, "PAID");
  assert.equal(result.transactionId, "ISSUER-1");
  assert.equal(result.providerPaymentId, "NREF-1");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
});

test("Nagad aborted status is CANCELLED even when statusCode is 000", async (t) => {
  installVerification(
    t,
    verifiedPayment({ status: "Aborted", statusCode: "000" }),
  );

  const result = await nagadProvider.verify(context(), {
    payment_ref_id: "NREF-1",
  });

  assert.equal(result.status, "CANCELLED");
});

test("Nagad rejects a successful verification with a different amount", async (t) => {
  installVerification(t, verifiedPayment({ amount: "10.00" }));

  await assert.rejects(
    () =>
      nagadProvider.verify(context(), {
        payment_ref_id: "NREF-1",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      /amount does not match/.test(error.message),
  );
});

test("Nagad requires the BDT currency code for a successful payment", async (t) => {
  installVerification(t, verifiedPayment({ currencyCode: undefined }));

  await assert.rejects(
    () =>
      nagadProvider.verify(context(), {
        payment_ref_id: "NREF-1",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      /currency/.test(error.message),
  );
});

test("Nagad rejects a callback for another order before calling the gateway", async (t) => {
  const requests = installVerification(t, verifiedPayment());

  await assert.rejects(
    () =>
      nagadProvider.verify(context(), {
        payment_ref_id: "NREF-1",
        order_id: "another-order",
      }),
    (error: unknown) =>
      error instanceof ApiError && error.statusCode === 400,
  );

  assert.equal(requests.length, 0);
});

test("Nagad rejects a callback whose payment reference differs from the stored one", async (t) => {
  const requests = installVerification(t, verifiedPayment());

  await assert.rejects(
    () =>
      nagadProvider.verify(context(), {
        payment_ref_id: "NREF-OTHER",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      /reference/.test(error.message),
  );

  assert.equal(requests.length, 0);
});

test("Nagad rejects a verify response for a different payment reference", async (t) => {
  installVerification(
    t,
    verifiedPayment({ paymentReferenceId: "NREF-OTHER" }),
  );

  await assert.rejects(
    () =>
      nagadProvider.verify(context(), {
        payment_ref_id: "NREF-1",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 400 &&
      /reference/.test(error.message),
  );
});
