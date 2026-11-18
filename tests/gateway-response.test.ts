import "./helpers/test-env";

import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../src/utils/ApiError";
import {
  gatewayErrorMessage,
  gatewayFetch,
  readGatewayResponse,
} from "../src/modules/payment/providers/gateway-response";
import { jsonResponse, rawResponse } from "./helpers/http";

test("strict parser does not repair malformed gateway JSON", async (t) => {
  t.mock.method(console, "warn", () => undefined);

  const body =
    '{\n  "statusCode": "9999",\n  "statusMessage": "Invalid or unrecognized access credentials"\n';
  const info = await readGatewayResponse(
    rawResponse(body, 200, "application/json"),
    { provider: "bKash", operation: "token grant" },
  );

  assert.equal(info.httpStatus, 200);
  assert.equal(info.httpOk, true);
  assert.equal(info.bodyKind, "invalid-json");
  assert.equal(info.isUsableJson, false);
  assert.deepEqual(info.data, {});
  assert.match(info.parseErrorMessage ?? "", /JSON/i);
});

test("strict parser classifies HTML, empty and non-object JSON bodies", async (t) => {
  t.mock.method(console, "warn", () => undefined);

  const html = await readGatewayResponse(
    rawResponse("<html><body>gateway down</body></html>", 200, "text/html"),
    { provider: "bKash", operation: "query" },
  );
  assert.equal(html.bodyKind, "html");
  assert.equal(html.isUsableJson, false);

  const empty = await readGatewayResponse(
    rawResponse("", 204, "application/json"),
    { provider: "bKash", operation: "query" },
  );
  assert.equal(empty.bodyKind, "empty");

  const array = await readGatewayResponse(
    jsonResponse([{ statusCode: "0000" }]),
    { provider: "bKash", operation: "query" },
  );
  assert.equal(array.bodyKind, "json-non-object");
  assert.equal(array.isUsableJson, false);
});

test("strict parser accepts a JSON object without modifying it", async () => {
  const info = await readGatewayResponse(
    jsonResponse({ statusCode: "0000", paymentID: "PAY-1" }),
    { provider: "bKash", operation: "query" },
  );

  assert.equal(info.bodyKind, "json-object");
  assert.equal(info.isUsableJson, true);
  assert.equal(info.data.paymentID, "PAY-1");
});

test("gateway diagnostics redact credentials and Stripe keys", async (t) => {
  const captured: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => {
    captured.push(JSON.stringify(args));
  });

  await readGatewayResponse(
    rawResponse(
      JSON.stringify({
        error: "failed",
        password: "super-secret-password",
        token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
        key: "sk_test_abcdef123456",
      }),
      500,
      "application/json",
    ),
    { provider: "bKash", operation: "token grant" },
  );

  const output = captured.join("\n");
  assert.ok(output.length > 0);
  assert.doesNotMatch(output, /super-secret-password/);
  assert.doesNotMatch(output, /sk_test_abcdef123456/);
  assert.doesNotMatch(output, /eyJhbGciOiJIUzI1NiJ9/);
  assert.match(output, /REDACTED/);
});

test("gatewayErrorMessage returns the first non-empty provider message", () => {
  assert.equal(
    gatewayErrorMessage(
      { statusMessage: "", errorMessage: "Invalid credentials" },
      "statusMessage",
      "errorMessage",
    ),
    "Invalid credentials",
  );
});

test("gatewayFetch maps a timeout to a 504 ApiError", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;

      if (!signal) {
        reject(new Error("signal missing"));
        return;
      }

      signal.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () =>
      gatewayFetch("https://gateway.example.test/slow", {
        provider: "TestGateway",
        operation: "testing the timeout",
        timeoutMs: 10,
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 504 &&
      /did not respond in time/.test(error.message),
  );
});

test("gatewayFetch maps connection failures to a 502 ApiError", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () =>
      gatewayFetch("https://gateway.example.test/down", {
        provider: "TestGateway",
        operation: "connecting",
      }),
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === 502 &&
      /Could not reach TestGateway/.test(error.message),
  );
});
