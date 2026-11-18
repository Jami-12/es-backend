import "./helpers/test-env";

import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentMethod } from "@prisma/client";
import {
  checkoutSchema,
  orderListQuerySchema,
} from "../src/validations/order.validation";
import {
  createProductSchema,
  updateProductSchema,
} from "../src/validations/product.validation";

test("checkoutSchema accepts all requested payment method aliases: bKash, COD, Nagad, Stripe", () => {
  const addressId = "123e4567-e89b-12d3-a456-426614174000";

  const bkashParsed = checkoutSchema.parse({
    addressId,
    paymentMethod: "bKash",
  });
  assert.equal(bkashParsed.paymentMethod, PaymentMethod.BKASH);

  const codParsed = checkoutSchema.parse({
    addressId,
    paymentMethod: "COD",
  });
  assert.equal(codParsed.paymentMethod, PaymentMethod.CASH_ON_DELIVERY);

  const nagadParsed = checkoutSchema.parse({
    addressId,
    paymentMethod: "Nagad",
  });
  assert.equal(nagadParsed.paymentMethod, PaymentMethod.NAGAD);

  const stripeParsed = checkoutSchema.parse({
    addressId,
    paymentMethod: "Stripe",
  });
  assert.equal(stripeParsed.paymentMethod, PaymentMethod.CARD);

  const directEnumParsed = checkoutSchema.parse({
    addressId,
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
  });
  assert.equal(directEnumParsed.paymentMethod, PaymentMethod.CASH_ON_DELIVERY);
});

test("checkoutSchema safely accepts null and empty couponCode and notes without errors", () => {
  const addressId = "123e4567-e89b-12d3-a456-426614174000";

  const parsedNulls = checkoutSchema.parse({
    addressId,
    paymentMethod: "bKash",
    couponCode: null,
    notes: null,
  });
  assert.equal(parsedNulls.couponCode, undefined);
  assert.equal(parsedNulls.notes, undefined);

  const parsedEmpties = checkoutSchema.parse({
    addressId,
    paymentMethod: "COD",
    couponCode: "",
    notes: "",
  });
  assert.equal(parsedEmpties.couponCode, undefined);
  assert.equal(parsedEmpties.notes, undefined);
});

test("orderListQuerySchema parses pagination and empty query parameters without 400 Bad Request", () => {
  const parsed = orderListQuerySchema.parse({
    page: "2",
    limit: "15",
    status: "",
    paymentStatus: "",
    paymentMethod: "",
    userId: "",
    search: "",
  });

  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 15);
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.paymentStatus, undefined);
  assert.equal(parsed.paymentMethod, undefined);
  assert.equal(parsed.userId, undefined);
  assert.equal(parsed.search, undefined);
});

test("product schemas allow optional and nullable modelUrl for products without 3D assets", () => {
  const categoryId = "123e4567-e89b-12d3-a456-426614174000";

  const createdWithoutModel = createProductSchema.parse({
    title: "Classic Cotton T-Shirt",
    sku: "TSHIRT-001",
    description: "Premium cotton everyday t-shirt with classic fit.",
    price: 49.99,
    stock: 50,
    categoryId,
    thumbnail: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  });
  assert.equal(createdWithoutModel.modelUrl, null);

  const createdWithNullModel = createProductSchema.parse({
    title: "Classic Cotton Pants",
    sku: "PANTS-001",
    description: "Comfortable tailored casual pants.",
    price: 79.99,
    stock: 30,
    categoryId,
    modelUrl: null,
    thumbnail: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  });
  assert.equal(createdWithNullModel.modelUrl, null);

  const updatedWithNullModel = updateProductSchema.parse({
    modelUrl: null,
  });
  assert.equal(updatedWithNullModel.modelUrl, null);

  const updatedWithEmptyModel = updateProductSchema.parse({
    modelUrl: "",
  });
  assert.equal(updatedWithEmptyModel.modelUrl, null);
});
