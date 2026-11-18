import "./helpers/test-env";

import assert from "node:assert/strict";
import path from "node:path";
import { test, mock } from "node:test";
import { pathToFileURL } from "node:url";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { ApiError } from "../src/utils/ApiError";
import type { AuthenticatedUser } from "../src/types/auth.types";

const srcRoot = path.resolve(__dirname, "..", "src");
const toUrl = (...segments: string[]): string =>
  pathToFileURL(path.join(srcRoot, ...segments)).href;

const prismaUrl = toUrl("config", "prisma.ts");
const orderServiceUrl = toUrl("modules", "order", "order.service.ts");
const providersUrl = toUrl("modules", "payment", "providers", "index.ts");
const paymentServiceUrl = toUrl(
  "modules",
  "payment",
  "payment.service.ts",
);

const customer: AuthenticatedUser = {
  id: "user-1",
  name: "Test Customer",
  email: "customer@example.com",
  role: Role.CUSTOMER,
  status: UserStatus.ACTIVE,
};

const makePayment = () => ({
  id: "payment-1",
  orderId: "order-1",
  method: PaymentMethod.BKASH as PaymentMethod,
  status: PaymentStatus.PENDING as PaymentStatus,
  amount: new Prisma.Decimal("100.00"),
  transactionId: null as string | null,
  providerPaymentId: null as string | null,
  providerReference: null as string | null,
  providerResponse: null as Prisma.JsonValue,
  paidAt: null as Date | null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const makeOrder = () => ({
  id: "order-1",
  orderNumber: "ORD-1",
  userId: "user-1",
  status: OrderStatus.CONFIRMED as OrderStatus,
  paymentStatus: PaymentStatus.PENDING as PaymentStatus,
  paymentMethod: PaymentMethod.BKASH as PaymentMethod,
  totalAmount: 100,
  payment: { id: "payment-1" },
  customer: {
    id: "user-1",
    name: "Test Customer",
    email: "customer@example.com",
    phone: "01700000000",
  },
});

const state: {
  payment: ReturnType<typeof makePayment>;
  order: ReturnType<typeof makeOrder>;
  notifications: Array<Record<string, unknown>>;
  initiateCalls: number;
  verifyCalls: number;
  confirmCalls: number;
  failCalls: number;
  initiateError: Error | null;
  verifyError: Error | null;
  initiateResult: Record<string, unknown>;
  verifyResult: Record<string, unknown>;
} = {
  payment: makePayment(),
  order: makeOrder(),
  notifications: [],
  initiateCalls: 0,
  verifyCalls: 0,
  confirmCalls: 0,
  failCalls: 0,
  initiateError: null,
  verifyError: null,
  initiateResult: {},
  verifyResult: {},
};

let clockTick = 0;

const resetScenario = (): void => {
  clockTick = 0;
  state.payment = makePayment();
  state.order = makeOrder();
  state.notifications = [];
  state.initiateCalls = 0;
  state.verifyCalls = 0;
  state.confirmCalls = 0;
  state.failCalls = 0;
  state.initiateError = null;
  state.verifyError = null;
  state.initiateResult = {
    method: PaymentMethod.BKASH,
    paymentStatus: PaymentStatus.PROCESSING,
    message: "Redirect the customer to the bKash payment page",
    redirectUrl: "https://sandbox.bka.sh/checkout/PAY-1",
    providerPaymentId: "PAY-1",
    providerReference: "ORD-1",
    providerResponse: {
      paymentID: "PAY-1",
      bkashURL: "https://sandbox.bka.sh/checkout/PAY-1",
    },
  };
  state.verifyResult = {
    status: "PENDING",
    providerPaymentId: "PAY-1",
    providerResponse: {
      paymentID: "PAY-1",
      bkashURL: "https://sandbox.bka.sh/checkout/PAY-1",
    },
    rawStatus: "Initiated",
  };
};

const nextTimestamp = (): Date => {
  clockTick += 1;
  return new Date(Date.UTC(2026, 0, 1, 0, 0, clockTick));
};

const fakePrisma: Record<string, unknown> = {
  $queryRaw: async () => [],
  $transaction: async (argument: unknown) => {
    if (typeof argument === "function") {
      return (argument as (client: unknown) => Promise<unknown>)(fakePrisma);
    }

    return Promise.all(argument as Promise<unknown>[]);
  },
  payment: {
    findUnique: async ({ where }: { where: Record<string, string> }) => {
      if (where.id && where.id !== state.payment.id) {
        return null;
      }

      if (where.orderId && where.orderId !== state.payment.orderId) {
        return null;
      }

      return {
        ...state.payment,
        order: { userId: state.order.userId },
      };
    },
    findFirst: async ({
      where,
    }: {
      where: Record<string, string>;
    }) => {
      if (
        where.providerPaymentId &&
        where.providerPaymentId !== state.payment.providerPaymentId
      ) {
        return null;
      }

      return { ...state.payment };
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, string>;
      data: Record<string, unknown>;
    }) => {
      if (where.id !== state.payment.id) {
        throw new Error(`Unexpected payment id: ${where.id}`);
      }

      state.payment = {
        ...state.payment,
        ...data,
        updatedAt: nextTimestamp(),
      } as ReturnType<typeof makePayment>;

      return { ...state.payment };
    },
    updateMany: async () => ({ count: 0 }),
  },
  order: {
    findUnique: async ({ where }: { where: Record<string, string> }) =>
      where.id === state.order.id ? { ...state.order } : null,
    findUniqueOrThrow: async ({
      where,
    }: {
      where: Record<string, string>;
    }) => {
      if (where.id !== state.order.id) {
        throw new Error("Order not found");
      }

      return { userId: state.order.userId };
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, string>;
      data: Record<string, unknown>;
    }) => {
      if (where.id !== state.order.id) {
        throw new Error(`Unexpected order id: ${where.id}`);
      }

      state.order = {
        ...state.order,
        ...data,
      } as ReturnType<typeof makeOrder>;

      return { ...state.order };
    },
  },
  notification: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      state.notifications.push(data);
      return data;
    },
  },
  financialTransaction: {
    findFirst: async () => null,
    create: async ({ data }: { data: unknown }) => data,
    deleteMany: async () => ({ count: 0 }),
  },
};

const fakeOrderService = {
  getOrderById: async (_requester: AuthenticatedUser, orderId: string) => {
    if (orderId !== state.order.id) {
      throw ApiError.notFound("Order not found");
    }

    return state.order;
  },
  confirmPaymentForOrder: async (
    orderId: string,
    transactionId?: string,
    providerReference?: string,
  ) => {
    state.confirmCalls += 1;
    state.payment = {
      ...state.payment,
      status: PaymentStatus.PAID,
      paidAt: nextTimestamp(),
      transactionId: transactionId ?? "TRX-GENERATED",
      providerReference: providerReference ?? null,
      updatedAt: nextTimestamp(),
    } as ReturnType<typeof makePayment>;
    state.order.paymentStatus = PaymentStatus.PAID;

    return state.order;
  },
  markPaymentFailedForOrder: async (orderId: string) => {
    state.failCalls += 1;
    state.payment = {
      ...state.payment,
      status: PaymentStatus.FAILED,
      updatedAt: nextTimestamp(),
    } as ReturnType<typeof makePayment>;
    state.order.paymentStatus = PaymentStatus.FAILED;

    return state.order;
  },
};

const fakeProvider = {
  method: PaymentMethod.BKASH,
  isConfigured: () => true,
  initiate: async () => {
    state.initiateCalls += 1;

    if (state.initiateError) {
      throw state.initiateError;
    }

    return state.initiateResult;
  },
  verify: async () => {
    state.verifyCalls += 1;

    if (state.verifyError) {
      throw state.verifyError;
    }

    return state.verifyResult;
  },
};

mock.module(prismaUrl, {
  exports: {
    prisma: fakePrisma,
    connectDatabase: async () => undefined,
    disconnectDatabase: async () => undefined,
  },
});

mock.module(orderServiceUrl, {
  exports: fakeOrderService,
});

mock.module(providersUrl, {
  exports: {
    getPaymentProvider: () => fakeProvider,
    bkashProvider: fakeProvider,
    nagadProvider: fakeProvider,
    cardProvider: fakeProvider,
  },
});

const servicePromise = import(paymentServiceUrl);

test("COD checkout does not call any online payment provider", async () => {
  resetScenario();
  state.order.paymentMethod = PaymentMethod.CASH_ON_DELIVERY;
  state.payment.method = PaymentMethod.CASH_ON_DELIVERY;
  state.payment.status = PaymentStatus.PENDING;

  const service = await servicePromise;
  const result = await service.initiatePayment(
    customer,
    "order-1",
    undefined,
  );

  assert.equal(result.method, PaymentMethod.CASH_ON_DELIVERY);
  assert.equal(result.paymentStatus, PaymentStatus.PENDING);
  assert.match(result.message, /Cash on Delivery/i);
  assert.equal(result.redirectUrl, undefined);
  assert.equal(result.clientSecret, undefined);
  assert.equal(state.initiateCalls, 0);
  assert.equal(state.verifyCalls, 0);
});

test("a customer cannot read another customer's payment", async () => {
  resetScenario();

  const service = await servicePromise;
  const otherCustomer: AuthenticatedUser = {
    ...customer,
    id: "user-2",
    email: "other@example.com",
  };

  await assert.rejects(
    () => service.getPaymentById(otherCustomer, "payment-1"),
    (error: unknown) =>
      error instanceof ApiError && error.statusCode === 404,
  );
});

test("a repeated checkout reuses the in-flight payment instead of creating another", async () => {
  resetScenario();

  const service = await servicePromise;
  const first = await service.initiatePayment(customer, "order-1", undefined);

  assert.equal(first.paymentStatus, PaymentStatus.PROCESSING);
  assert.equal(state.initiateCalls, 1);
  assert.equal(state.payment.providerPaymentId, "PAY-1");
  assert.equal(state.payment.status, PaymentStatus.PROCESSING);

  const second = await service.initiatePayment(customer, "order-1", undefined);

  assert.equal(state.initiateCalls, 1, "provider must not be called twice");
  assert.equal(state.verifyCalls, 1);
  assert.equal(second.paymentStatus, PaymentStatus.PROCESSING);
  assert.equal(second.providerPaymentId, "PAY-1");
  assert.equal(
    second.redirectUrl,
    "https://sandbox.bka.sh/checkout/PAY-1",
  );
});

test("a resumed checkout keeps the stored redirect URL when the status query omits it", async () => {
  resetScenario();
  state.verifyResult = {
    status: "PENDING",
    providerPaymentId: "PAY-1",
    providerResponse: {
      paymentID: "PAY-1",
      transactionStatus: "Initiated",
    },
    rawStatus: "Initiated",
  };

  const service = await servicePromise;
  const first = await service.initiatePayment(customer, "order-1", undefined);
  const second = await service.initiatePayment(customer, "order-1", undefined);

  assert.equal(
    first.redirectUrl,
    "https://sandbox.bka.sh/checkout/PAY-1",
  );
  assert.equal(
    second.redirectUrl,
    "https://sandbox.bka.sh/checkout/PAY-1",
    "the create response URL must survive a status query that omits it",
  );
  assert.equal(state.initiateCalls, 1);
  assert.equal(state.verifyCalls, 1);
});

test("a failed gateway initiation rolls the payment claim back", async () => {
  resetScenario();
  state.initiateError = new ApiError(502, "gateway is down");

  const service = await servicePromise;

  await assert.rejects(
    () => service.initiatePayment(customer, "order-1", undefined),
    (error: unknown) =>
      error instanceof ApiError && error.statusCode === 502,
  );

  assert.equal(state.initiateCalls, 1);
  assert.equal(state.payment.status, PaymentStatus.PENDING);
  assert.equal(state.payment.providerPaymentId, null);
  assert.equal(state.order.paymentStatus, PaymentStatus.PENDING);
});

test("a successful callback verifies the provider and confirms the order", async () => {
  resetScenario();
  state.payment.status = PaymentStatus.PROCESSING;
  state.payment.providerPaymentId = "PAY-1";
  state.verifyResult = {
    status: "PAID",
    transactionId: "TRX-1",
    providerReference: "REF-1",
    providerPaymentId: "PAY-1",
    providerResponse: { statusCode: "0000" },
  };

  const service = await servicePromise;
  const result = await service.handleProviderCallback({
    orderId: "order-1",
    paymentID: "PAY-1",
    status: "success",
  });

  assert.equal(result.status, PaymentStatus.PAID);
  assert.equal(state.verifyCalls, 1);
  assert.equal(state.confirmCalls, 1);
  assert.equal(state.order.paymentStatus, PaymentStatus.PAID);
  assert.equal(result.transactionId, "TRX-1");
});

test("a duplicate successful callback is idempotent", async () => {
  resetScenario();
  state.payment.status = PaymentStatus.PROCESSING;
  state.payment.providerPaymentId = "PAY-1";
  state.verifyResult = {
    status: "PAID",
    transactionId: "TRX-1",
    providerPaymentId: "PAY-1",
    providerResponse: { statusCode: "0000" },
  };

  const service = await servicePromise;

  const first = await service.handleProviderCallback({
    orderId: "order-1",
    paymentID: "PAY-1",
  });
  const second = await service.handleProviderCallback({
    orderId: "order-1",
    paymentID: "PAY-1",
  });

  assert.equal(first.status, PaymentStatus.PAID);
  assert.equal(second.status, PaymentStatus.PAID);
  assert.equal(state.verifyCalls, 1);
  assert.equal(state.confirmCalls, 1);
});

test("a late pending callback cannot move a cancelled payment back to processing", async () => {
  resetScenario();
  state.payment.status = PaymentStatus.CANCELLED;
  state.payment.providerPaymentId = "PAY-1";
  state.verifyResult = {
    status: "PENDING",
    providerPaymentId: "PAY-1",
    providerResponse: { transactionStatus: "Initiated" },
  };

  const service = await servicePromise;
  const result = await service.handleProviderCallback({
    orderId: "order-1",
    paymentID: "PAY-1",
  });

  assert.equal(result.status, PaymentStatus.CANCELLED);
  assert.equal(state.verifyCalls, 1);
  assert.equal(state.notifications.length, 0);
});

test("the generic payment webhook rejects an invalid shared secret", async () => {
  resetScenario();

  const service = await servicePromise;

  await assert.rejects(
    () =>
      service.handleProviderWebhook("wrong-secret", {
        orderId: "order-1",
        status: "PAID",
      }),
    (error: unknown) =>
      error instanceof ApiError && error.statusCode === 401,
  );

  assert.equal(state.confirmCalls, 0);
});
