import { randomUUID } from "node:crypto";
import {
  DiscountType,
  InventoryMovementType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { assertPaymentMethodAvailable } from "../payment/payment-availability";
import { recordAuditBestEffort, type AuditInput } from "../../utils/audit";
import { deleteLedgerEntry, recordIncome, recordRefund } from "../../utils/ledger";
import {
  calculateShippingCost,
  roundMoney,
  toDecimal,
} from "../../utils/money";
import { resolveProductPricing } from "../../utils/productPricing";
import { isProductSize } from "../../utils/product-options";
import { buildPaginationMeta } from "../../utils/pagination";
import {
  generateOrderNumber,
  generateReceiptNumber,
} from "../../utils/generateOrderNumber";
import {
  buildReceipt,
  buildReceiptUrl,
  generateTransactionId,
} from "../../utils/receipt";
import { resolveCoupon } from "../coupon/coupon.service";
import { getSettings } from "../settings/settings.service";
import {
  notifyCustomerAndAdmins,
  ORDER_PLACED_EVENT,
} from "../notification/notification-events";
import { notifyExternalOrderChannels } from "../notification/order-notification.service";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  CashCollectionItem,
  CashCollectionListQuery,
  CashCollectionStatus,
  CashCollectionSummary,
  CheckoutInput,
  CollectCodPaymentInput,
  OrderListQuery,
  OrderResponse,
  OrderTrackingEvent,
  OrderTrackingResult,
  PaginatedCashCollections,
  PaginatedOrders,
  ReceiptData,
  UpdateOrderStatusInput,
} from "../../types/order.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const orderInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
  },
  address: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      division: true,
      district: true,
      area: true,
      addressLine: true,
      postalCode: true,
    },
  },
  coupon: {
    select: {
      id: true,
      code: true,
      discountPercent: true,
      discountAmount: true,
    },
  },
  items: {
    orderBy: { createdAt: "asc" },
  },
  payment: true,
} satisfies Prisma.OrderInclude;

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type TxClient = Prisma.TransactionClient;

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [],
};

const STATUS_NOTIFICATION_TITLES: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.CONFIRMED]: "Order confirmed",
  [OrderStatus.PROCESSING]: "Order is being processed",
  [OrderStatus.SHIPPED]: "Order shipped",
  [OrderStatus.DELIVERED]: "Order delivered",
  [OrderStatus.CANCELLED]: "Order cancelled",
  [OrderStatus.RETURNED]: "Order returned",
};

const toOrderResponse = (order: OrderRecord): OrderResponse => ({
  id: order.id,
  orderNumber: order.orderNumber,
  userId: order.userId,
  addressId: order.addressId,
  subtotal: order.subtotal.toNumber(),
  discountAmount: order.discountAmount.toNumber(),
  shippingCost: order.shippingCost.toNumber(),
  taxAmount: order.taxAmount.toNumber(),
  totalAmount: order.totalAmount.toNumber(),
  totalProductCost: order.totalProductCost.toNumber(),
  grossProfit: order.grossProfit.toNumber(),
  netProfit: order.netProfit.toNumber(),
  refundedAmount: order.refundedAmount.toNumber(),
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  /** Present only for guest orders; clients must store it to access the order. */
  guestToken: order.guestToken,
  receiptNumber: order.receiptNumber,
  receiptUrl: order.receiptUrl,
  notes: order.notes,
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
  customer: order.user,
  address: order.address,
  items: order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    productImage: item.productImage,
    sku: item.sku,
    size: item.size,
    color: item.color,
    unitPrice: item.unitPrice.toNumber(),
    originalPrice: item.originalPrice.toNumber(),
    discountAmount: item.discountAmount.toNumber(),
    finalUnitPrice: item.finalUnitPrice.toNumber(),
    purchasePrice: item.purchasePrice.toNumber(),
    quantity: item.quantity,
    totalPrice: item.totalPrice.toNumber(),
    subtotal: item.subtotal.toNumber(),
    productCost: item.productCost.toNumber(),
    createdAt: item.createdAt.toISOString(),
  })),
  payment: order.payment
    ? {
        id: order.payment.id,
        method: order.payment.method,
        status: order.payment.status,
        amount: order.payment.amount.toNumber(),
        transactionId: order.payment.transactionId,
        providerReference: order.payment.providerReference,
        paidAt: order.payment.paidAt?.toISOString() ?? null,
        collectedById: order.payment.collectedById,
        collectedByName: order.payment.collectedByName,
        collectedAt: order.payment.collectedAt?.toISOString() ?? null,
        collectionNote: order.payment.collectionNote,
        createdAt: order.payment.createdAt.toISOString(),
        updatedAt: order.payment.updatedAt.toISOString(),
      }
    : null,
  coupon: order.coupon
    ? {
        id: order.coupon.id,
        code: order.coupon.code,
        discountPercent: order.coupon.discountPercent?.toNumber() ?? null,
        discountAmount: order.coupon.discountAmount?.toNumber() ?? null,
      }
    : null,
});

const createUniqueNumbers = async (
  tx: TxClient,
): Promise<{ orderNumber: string; receiptNumber: string }> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const orderNumber = generateOrderNumber();
    const receiptNumber = generateReceiptNumber();

    const existing = await tx.order.findFirst({
      where: {
        OR: [{ orderNumber }, { receiptNumber }],
      },
      select: { id: true },
    });

    if (!existing) {
      return { orderNumber, receiptNumber };
    }
  }

  throw ApiError.internal("Could not generate a unique order number");
};

const createNotification = async (
  tx: TxClient,
  userId: string,
  title: string,
  message: string,
  type: "ORDER" = "ORDER",
  adminMessage?: string,
  orderId?: string,
  eventType?: string,
): Promise<void> => {
  await notifyCustomerAndAdmins(tx, {
    customerId: userId,
    title,
    message,
    type,
    adminMessage,
    orderId,
    eventType,
  });
};

const lockCartRow = async (tx: TxClient, userId: string): Promise<void> => {
  await tx.$queryRaw`SELECT "id" FROM "carts" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
};

const lockOrderRow = async (tx: TxClient, orderId: string): Promise<void> => {
  await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
};

interface CheckoutCommerceSettings {
  shippingEnabled: boolean;
  shippingFee: number;
  freeShippingThreshold: number;
  flatDiscountEnabled: boolean;
  flatDiscountType: DiscountType | null;
  flatDiscountValue: number;
  flatDiscountMinAmount: number | null;
}

const getCheckoutCommerceSettings = async (): Promise<CheckoutCommerceSettings> => {
  const settings = await getSettings();

  return {
    shippingEnabled: settings.shippingEnabled,
    shippingFee: settings.shippingFee,
    freeShippingThreshold: settings.freeShippingThreshold,
    flatDiscountEnabled: settings.flatDiscountEnabled,
    flatDiscountType: settings.flatDiscountType,
    flatDiscountValue: settings.flatDiscountValue,
    flatDiscountMinAmount: settings.flatDiscountMinAmount,
  };
};

/**
 * Automatic store-wide discount. The optional minimum applies to the product
 * subtotal, and the result can never exceed that subtotal.
 */
const calculateFlatDiscountAmount = (
  subtotal: Prisma.Decimal,
  settings: CheckoutCommerceSettings,
): Prisma.Decimal => {
  if (
    !settings.flatDiscountEnabled ||
    !settings.flatDiscountType ||
    settings.flatDiscountValue <= 0
  ) {
    return toDecimal(0);
  }

  if (
    settings.flatDiscountMinAmount !== null &&
    subtotal.toNumber() < settings.flatDiscountMinAmount
  ) {
    return toDecimal(0);
  }

  const raw =
    settings.flatDiscountType === DiscountType.PERCENTAGE
      ? (subtotal.toNumber() * settings.flatDiscountValue) / 100
      : settings.flatDiscountValue;

  return toDecimal(
    Math.min(Math.max(roundMoney(raw), 0), Math.max(subtotal.toNumber(), 0)),
  );
};

const calculateOrderShippingCost = (
  subtotal: Prisma.Decimal,
  settings: CheckoutCommerceSettings,
): Prisma.Decimal => {
  if (!settings.shippingEnabled) {
    return toDecimal(0);
  }

  return toDecimal(
    calculateShippingCost(
      subtotal.toNumber(),
      settings.shippingFee,
      settings.freeShippingThreshold,
    ),
  );
};

export const isReceiptableOrder = (
  order: Pick<OrderResponse, "status" | "paymentStatus" | "paymentMethod">,
): boolean =>
  order.paymentStatus === PaymentStatus.PAID ||
  (order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
    ([OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED] as OrderStatus[]).includes(
      order.status,
    ));

const assertReceiptable = (order: OrderResponse): void => {
  if (!isReceiptableOrder(order)) {
    throw ApiError.conflict(
      "Receipt is available only after the order is confirmed or paid",
    );
  }
};

export const checkout = async (
  /** Null for guest checkout; the client sends items and contact details. */
  userId: string | null,
  input: CheckoutInput,
): Promise<OrderResponse> => {
  // Reject a dashboard-disabled method before locking the cart or touching stock.
  await assertPaymentMethodAvailable(input.paymentMethod);

  const commerce = await getCheckoutCommerceSettings();
  const guestToken = userId === null ? randomUUID() : null;

  const productInclude = {
    images: {
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      take: 1,
    },
    discount: true,
  } satisfies Prisma.ProductInclude;

  type CheckoutProduct = Prisma.ProductGetPayload<{
    include: typeof productInclude;
  }>;
  type CheckoutSourceItem = {
    id: string;
    product: CheckoutProduct;
    selectedSize: string | null;
    selectedColor: string | null;
    quantity: number;
  };

  const order = await prisma.$transaction(async (tx) => {
    let orderUserId = userId;
    let address: Prisma.AddressGetPayload<{}>;
    let sourceItems: CheckoutSourceItem[];
    const cartItemIds: string[] = [];

    if (userId) {
      if (!input.addressId) {
        throw ApiError.badRequest("A delivery address is required");
      }

      await lockCartRow(tx, userId);

      const cart = await tx.cart.findUnique({
        where: { userId },
        include: { items: { include: { product: { include: productInclude } } } },
      });

      if (!cart || cart.items.length === 0) {
        throw ApiError.badRequest("Your cart is empty");
      }

      const existingAddress = await tx.address.findFirst({
        where: { id: input.addressId, userId },
      });

      if (!existingAddress) {
        throw ApiError.notFound("Shipping address not found");
      }

      address = existingAddress;
      sourceItems = cart.items.map((item) => ({
        id: item.id,
        product: item.product,
        selectedSize: item.selectedSize,
        selectedColor: item.selectedColor,
        quantity: item.quantity,
      }));
      cartItemIds.push(...cart.items.map((item) => item.id));
    } else if (input.guest) {
      const { customer, items } = input.guest;

      // Guest checkouts use a synthetic customer so all existing order, payment
      // and notification relations stay intact. The public token is the only
      // credential needed to view or pay for the order afterwards.
      const guestUser = await tx.user.create({
        data: {
          name: customer.name,
          email: `guest+${randomUUID()}@guest.local`,
          phone: customer.phone,
          role: Role.CUSTOMER,
          status: UserStatus.ACTIVE,
          isActive: true,
        },
      });

      orderUserId = guestUser.id;
      address = await tx.address.create({
        data: {
          userId: guestUser.id,
          fullName: customer.name,
          phone: customer.phone,
          division: customer.division ?? null,
          district: customer.district,
          area: customer.area ?? null,
          addressLine: customer.addressLine,
          postalCode: customer.postalCode?.slice(0, 20) ?? null,
        },
      });

      const products = await tx.product.findMany({
        where: { id: { in: Array.from(new Set(items.map((item) => item.productId))) } },
        include: productInclude,
      });
      const productById = new Map(products.map((product) => [product.id, product]));

      sourceItems = items.map((item, index) => {
        const product = productById.get(item.productId);

        if (!product) {
          throw ApiError.notFound("One of the selected products is no longer available");
        }

        return {
          id: `guest-${index}`,
          product,
          selectedSize: item.size ?? null,
          selectedColor: item.color ?? null,
          quantity: item.quantity,
        };
      });
    } else {
      throw ApiError.badRequest("Guest checkout details are required");
    }

    let subtotal = new Prisma.Decimal(0);
    let totalProductCost = new Prisma.Decimal(0);
    const orderItems: {
      cartItemId: string;
      productId: string;
      productName: string;
      productImage: string | null;
      sku: string;
      size: string | null;
      color: string | null;
      unitPrice: Prisma.Decimal;
      originalPrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      finalUnitPrice: Prisma.Decimal;
      purchasePrice: Prisma.Decimal;
      quantity: number;
      totalPrice: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      productCost: Prisma.Decimal;
      previousStock: number;
    }[] = [];

    for (const item of sourceItems) {
      const { product } = item;

      if (product.status !== "ACTIVE" || product.archivedAt !== null) {
        throw ApiError.badRequest(
          `"${product.title}" is no longer available for purchase`,
        );
      }

      if (item.quantity > product.stock) {
        throw ApiError.conflict(
          `Insufficient stock for "${product.title}". Available: ${product.stock}, requested: ${item.quantity}`,
        );
      }

      // Sizes can be edited after an item enters the cart. Revalidate at
      // checkout so a removed or legacy size never reaches an order.
      const selectedSize = item.selectedSize?.trim() || "";
      const productSizes = Array.isArray(product.sizes)
        ? product.sizes.filter(
            (size): size is string => typeof size === "string",
          )
        : [];

      if (productSizes.length > 0) {
        if (
          !selectedSize ||
          !isProductSize(selectedSize) ||
          !productSizes.includes(selectedSize)
        ) {
          throw ApiError.badRequest(
            `Please review the size for "${product.title}" in your cart before checkout.`,
          );
        }
      } else if (selectedSize && !isProductSize(selectedSize)) {
        throw ApiError.badRequest(
          `"${product.title}" has an invalid size in your cart. Please remove and add it again.`,
        );
      }

      const pricing = resolveProductPricing(
        product.price,
        product.discount,
        new Date(),
        product.discountPrice,
        product.isDiscountActive,
      );
      const unitPrice = pricing.finalPrice;
      const totalPrice = unitPrice.mul(item.quantity);
      const purchasePrice = product.purchasePrice.greaterThan(0)
        ? product.purchasePrice
        : product.costPrice ?? new Prisma.Decimal(0);
      const productCost = purchasePrice.mul(item.quantity);

      subtotal = subtotal.add(totalPrice);
      totalProductCost = totalProductCost.add(productCost);

      cartItemIds.push(item.id);
      orderItems.push({
        cartItemId: item.id,
        productId: product.id,
        productName: product.title,
        productImage: product.images[0]?.imageUrl ?? null,
        sku: product.sku,
        size: selectedSize || null,
        color: item.selectedColor || null,
        unitPrice,
        originalPrice: pricing.originalPrice,
        discountAmount: pricing.discountAmount,
        finalUnitPrice: pricing.finalPrice,
        purchasePrice,
        quantity: item.quantity,
        totalPrice,
        subtotal: totalPrice,
        productCost,
        previousStock: product.stock,
      });
    }

    const flatDiscountAmount = calculateFlatDiscountAmount(subtotal, commerce);
    let couponDiscountAmount = new Prisma.Decimal(0);
    let couponId: string | null = null;
    let couponUsageLimit: number | null = null;

    if (input.couponCode) {
      const couponBase = subtotal.minus(flatDiscountAmount);
      const { coupon, discountAmount: discount } = await resolveCoupon(
        input.couponCode,
        couponBase.toNumber(),
        tx,
      );

      couponDiscountAmount = toDecimal(
        Math.min(discount, Math.max(couponBase.toNumber(), 0)),
      );
      couponId = coupon.id;
      couponUsageLimit = coupon.usageLimit;
    }

    // Store-wide and coupon discounts are separate line items but share one
    // stored total. Neither can reduce the product subtotal below zero.
    const discountAmount = Prisma.Decimal.min(
      subtotal,
      flatDiscountAmount.plus(couponDiscountAmount),
    );
    const discountedSubtotal = subtotal.minus(discountAmount);
    // Shipping is an order-level charge based on the PRODUCT SUBTOTAL only.
    // Coupons and store-wide discounts never change shipping, and a disabled
    // shipping fee always results in a zero charge.
    const shippingCost = calculateOrderShippingCost(subtotal, commerce);
    const taxAmount = new Prisma.Decimal(0);
    const totalAmount = discountedSubtotal.plus(shippingCost).plus(taxAmount);
    const grossProfit = discountedSubtotal.minus(totalProductCost);
    const netProfit = grossProfit;

    if (couponId) {
      const usageWhere: Prisma.CouponWhereInput = {
        id: couponId,
        isActive: true,
      };

      if (couponUsageLimit !== null) {
        usageWhere.usedCount = { lt: couponUsageLimit };
      }

      const usageResult = await tx.coupon.updateMany({
        where: usageWhere,
        data: { usedCount: { increment: 1 } },
      });

      if (usageResult.count === 0) {
        throw ApiError.conflict(
          "This coupon has reached its usage limit. Please try again.",
        );
      }
    }

    const orderId = randomUUID();

    for (const item of orderItems) {
      const stockUpdate = await tx.product.updateMany({
        where: {
          id: item.productId,
          status: "ACTIVE",
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
          soldCount: { increment: item.quantity },
        },
      });

      if (stockUpdate.count === 0) {
        throw ApiError.conflict(
          `"${item.productName}" no longer has sufficient stock. Please refresh your cart.`,
        );
      }

      await tx.inventoryLog.create({
        data: {
          productId: item.productId,
          movementType: InventoryMovementType.ORDER_SALE,
          quantity: -item.quantity,
          previousStock: item.previousStock,
          newStock: item.previousStock - item.quantity,
          reason: `Order ${orderId} sale`,
          referenceType: "ORDER",
          referenceId: orderId,
        },
      });
    }

    const { orderNumber, receiptNumber } = await createUniqueNumbers(tx);

    const createdOrder = await tx.order.create({
      data: {
        id: orderId,
        orderNumber,
        userId: orderUserId!,
        addressId: address.id,
        guestToken,
        guestEmail: input.guest?.customer.email ?? null,
        guestPhone: input.guest?.customer.phone ?? null,
        couponId,
        subtotal,
        discountAmount,
        shippingCost,
        taxAmount,
        totalAmount,
        totalProductCost,
        grossProfit,
        netProfit,
        refundedAmount: new Prisma.Decimal(0),
        status:
          input.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
            ? OrderStatus.CONFIRMED
            : OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: input.paymentMethod,
        receiptNumber,
        receiptUrl: buildReceiptUrl(orderId),
        notes: input.notes?.trim() || null,
        items: {
          create: orderItems.map((item) => ({
            product: { connect: { id: item.productId } },
            productName: item.productName,
            productImage: item.productImage,
            sku: item.sku,
            size: item.size,
            color: item.color,
            unitPrice: item.unitPrice,
            originalPrice: item.originalPrice,
            discountAmount: item.discountAmount,
            finalUnitPrice: item.finalUnitPrice,
            purchasePrice: item.purchasePrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            subtotal: item.subtotal,
            productCost: item.productCost,
          })),
        },
        payment: {
          create: {
            method: input.paymentMethod,
            status: PaymentStatus.PENDING,
            amount: totalAmount,
          },
        },
      },
      include: orderInclude,
    });

    if (cartItemIds.length > 0) {
      await tx.cartItem.deleteMany({
        where: { id: { in: cartItemIds } },
      });
    }

    await createNotification(
      tx,
      orderUserId!,
      "Order placed",
      `Your order ${createdOrder.orderNumber} has been placed successfully.`,
      "ORDER",
      `New order ${createdOrder.orderNumber} placed by ${createdOrder.user.name} for ${createdOrder.totalAmount.toFixed(2)}.`,
      createdOrder.id,
      ORDER_PLACED_EVENT,
    );

    if (input.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
      await createNotification(
        tx,
        orderUserId!,
        "Order confirmed",
        `Your order ${createdOrder.orderNumber} is confirmed. Payment will be collected on delivery.`,
        "ORDER",
        `Order ${createdOrder.orderNumber} is confirmed and awaiting cash collection on delivery.`,
        createdOrder.id,
      );
    }

    return createdOrder;
  }, { maxWait: 10_000, timeout: 20_000 });

  // External alerts are intentionally outside the transaction: they are
  // best-effort and never block or roll back a successful checkout.
  void notifyExternalOrderChannels({
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount.toNumber(),
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    guestToken: order.guestToken,
    user: { name: order.user.name, email: order.user.email },
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      size: item.size,
      totalPrice: item.totalPrice.toNumber(),
    })),
  }).catch(() => {
    // notifyExternalOrderChannels already logs per-channel failures.
  });

  return toOrderResponse(order);
};

export const listOrders = async (
  requester: AuthenticatedUser,
  query: OrderListQuery,
): Promise<PaginatedOrders> => {
  const canManageAllOrders =
    requester.role === Role.ADMIN || requester.role === Role.SUPER_ADMIN;

  const where: Prisma.OrderWhereInput = {};

  if (canManageAllOrders) {
    if (query.userId) {
      where.userId = query.userId;
    }
  } else {
    where.userId = requester.id;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.paymentStatus || query.paymentMethod) {
    where.payment = {
      is: {
        ...(query.paymentStatus && { status: query.paymentStatus }),
        ...(query.paymentMethod && { method: query.paymentMethod }),
      },
    };
  }

  if (query.search) {
    where.orderNumber = {
      contains: query.search,
      mode: "insensitive",
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: query.sortOrder },
      skip,
      take: query.limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items: orders.map(toOrderResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

const findOrderRecord = async (orderId: string): Promise<OrderRecord> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });

  if (!order) {
    throw ApiError.notFound("Order not found");
  }

  return order;
};

export const getOrderById = async (
  requester: AuthenticatedUser,
  orderId: string,
): Promise<OrderResponse> => {
  const order = await findOrderRecord(orderId);

  const isOwner = order.userId === requester.id;
  const canManageAllOrders =
    requester.role === Role.ADMIN || requester.role === Role.SUPER_ADMIN;

  if (!isOwner && !canManageAllOrders) {
    throw ApiError.notFound("Order not found");
  }

  return toOrderResponse(order);
};

/**
 * Guest orders have no login credential. The random token returned at checkout
 * is the only thing that grants post-checkout access to the full order.
 */
export const getGuestOrderById = async (
  orderId: string,
  guestToken: string,
): Promise<OrderResponse> => {
  const order = await findOrderRecord(orderId);

  if (!order.guestToken || order.guestToken !== guestToken.trim()) {
    throw ApiError.notFound("Order not found");
  }

  return toOrderResponse(order);
};

/** Reuses the existing authenticated payment pipeline for guest orders. */
export const getGuestOrderActor = async (
  orderId: string,
  guestToken: string,
): Promise<AuthenticatedUser> => {
  const order = await getGuestOrderById(orderId, guestToken);

  return {
    id: order.userId,
    name: order.customer.name,
    email: order.customer.email,
    role: Role.CUSTOMER,
    status: UserStatus.ACTIVE,
  };
};

/** Used by provider callbacks to mark a return URL as guest-owned, never to reveal the token. */
export const isGuestOrder = async (orderId: string): Promise<boolean> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { guestToken: true },
  });

  return Boolean(order?.guestToken);
};

export const getOrderReceipt = async (
  requester: AuthenticatedUser,
  orderId: string,
): Promise<ReceiptData> => {
  const order = await getOrderById(requester, orderId);
  assertReceiptable(order);
  return buildReceipt(order);
};

export const getGuestOrderReceipt = async (
  orderId: string,
  guestToken: string,
): Promise<ReceiptData> => {
  const order = await getGuestOrderById(orderId, guestToken);
  assertReceiptable(order);
  return buildReceipt(order);
};

const restoreStockForOrder = async (
  tx: TxClient,
  order: OrderRecord,
  movementType: InventoryMovementType,
): Promise<void> => {
  for (const item of order.items) {
    if (!item.productId) {
      continue;
    }

    const updated = await tx.product.update({
      where: { id: item.productId },
      data: {
        stock: { increment: item.quantity },
        soldCount: { decrement: item.quantity },
      },
      select: { stock: true },
    });

    await tx.inventoryLog.create({
      data: {
        productId: item.productId,
        movementType,
        quantity: item.quantity,
        previousStock: updated.stock - item.quantity,
        newStock: updated.stock,
        reason: `Order ${order.orderNumber} ${movementType.toLowerCase().replace(/_/g, " ")}`,
        referenceType: "ORDER",
        referenceId: order.id,
      },
    });
  }
};

interface CashCollectionOptions {
  actor?: AuthenticatedUser;
  note?: string | null;
  reference?: string | null;
  ipAddress?: string;
  automatic?: boolean;
}

interface CashCollectionResult {
  transactionId: string;
  collectionNote: string;
  /** Returned so the audit write can happen after the transaction commits. */
  auditInput?: AuditInput;
}

interface ProductNumberSource {
  orderNumber: string;
  items: Array<{
    id: string;
    sku: string | null;
    productId: string | null;
    quantity: number;
  }>;
}

const buildProductNumber = (
  order: ProductNumberSource,
): { value: string; itemCount: number } => {
  const firstItem = order.items[0];
  const itemCount = order.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );
  const code =
    firstItem?.sku?.trim() || firstItem?.productId || firstItem?.id || order.orderNumber;
  const value =
    order.items.length > 1
      ? `${code} (+${order.items.length - 1} more)`
      : `${code}${itemCount > 1 ? ` x${itemCount}` : ""}`;

  return { value, itemCount };
};

const buildCollectionNote = (
  order: OrderRecord,
  transactionId: string,
  amount: Prisma.Decimal,
  collectedAt: Date,
  collectorName: string,
  extraNote?: string | null,
): string => {
  const customerName =
    order.address?.fullName?.trim() || order.user?.name || "Customer";
  const productNames =
    order.items
      .map((item) => `${item.productName} × ${item.quantity}`)
      .join(", ") || "No items";
  const productNumber = buildProductNumber(order);

  return [
    `Order Code: ${order.orderNumber}`,
    `Transaction Number: ${transactionId}`,
    `Customer Name: ${customerName}`,
    `Product Number: ${productNumber.value} (${productNumber.itemCount} item(s))`,
    `Product Name(s): ${productNames}`,
    `Amount: ${amount.toFixed(2)} ${env.STORE_CURRENCY}`,
    "Status: Collected",
    `Timestamp: ${collectedAt.toISOString()}`,
    `Collected By: ${collectorName}`,
    extraNote ? `Note: ${extraNote}` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

/**
 * Records a cash collection and its income ledger entry inside an existing
 * transaction. Any payment method can be settled from the Cash Collection
 * screen, but cancelled/returned orders and cancelled/refunded payments are
 * always rejected. A PAID payment is a no-op so one-click double clicks cannot
 * post duplicate income.
 */
const recordCashCollection = async (
  tx: TxClient,
  order: OrderRecord,
  options: CashCollectionOptions = {},
): Promise<CashCollectionResult | null> => {
  if (!order.payment) {
    throw ApiError.notFound("Order payment not found");
  }

  if (
    order.status === OrderStatus.CANCELLED ||
    order.status === OrderStatus.RETURNED
  ) {
    throw ApiError.conflict(
      `Cannot collect cash for a ${order.status.toLowerCase()} order`,
    );
  }

  if (order.payment.status === PaymentStatus.PAID) {
    return null;
  }

  if (order.payment.status === PaymentStatus.REFUNDED) {
    throw ApiError.conflict("Refunded payments cannot be collected");
  }

  if (order.payment.status === PaymentStatus.CANCELLED) {
    throw ApiError.conflict("Cancelled payments cannot be collected");
  }

  const collectedAt = new Date();
  const transactionId =
    options.reference?.trim() ||
    order.payment.transactionId ||
    generateTransactionId(order.payment.method);
  const collectorName = options.actor?.name ?? "System (automatic)";
  const collectionNote = buildCollectionNote(
    order,
    transactionId,
    order.payment.amount,
    collectedAt,
    collectorName,
    options.note,
  );

  await tx.payment.update({
    where: { id: order.payment.id },
    data: {
      status: PaymentStatus.PAID,
      paidAt: collectedAt,
      transactionId,
      collectedById: options.actor?.id ?? null,
      collectedByName: collectorName,
      collectedAt,
      collectionNote,
    },
  });

  await recordIncome(
    {
      amount: order.payment.amount,
      date: collectedAt,
      description: `Cash collection for order ${order.orderNumber} · ${transactionId}`,
      referenceType: "PAYMENT",
      referenceId: order.payment.id,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        method: order.payment.method,
        transactionId,
        collectedById: options.actor?.id ?? null,
        collectedByName: collectorName,
        automatic: options.automatic ?? false,
        customerName:
          order.address?.fullName?.trim() || order.user?.name || "Customer",
        products: order.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
        })),
      },
    },
    tx,
  );

  await tx.order.update({
    where: { id: order.id },
    data: { paymentStatus: PaymentStatus.PAID },
  });

  await createNotification(
    tx,
    order.userId,
    "Cash collection recorded",
    `Cash payment of ${order.payment.amount.toFixed(2)} for order ${order.orderNumber} has been recorded. Transaction: ${transactionId}.`,
    "ORDER",
    `Cash of ${order.payment.amount.toFixed(2)} for order ${order.orderNumber} was ${options.automatic ? "automatically recorded on delivery" : `collected by ${collectorName}`}. Transaction: ${transactionId}.`,
    order.id,
  );

  const auditInput: AuditInput | undefined = options.actor
    ? {
        userId: options.actor.id,
        action:
          order.payment.method === PaymentMethod.CASH_ON_DELIVERY
            ? "COLLECT_COD_PAYMENT"
            : "COLLECT_CASH_PAYMENT",
        entity: "Order",
        entityId: order.id,
        description: `Recorded cash collection for order ${order.orderNumber}`,
        oldData: {
          paymentStatus: order.payment.status,
          paidAt: order.payment.paidAt,
        },
        newData: {
          paymentStatus: PaymentStatus.PAID,
          paidAt: collectedAt,
          transactionId,
          collectedById: options.actor.id,
          collectedByName: collectorName,
          collectionNote,
        },
        ipAddress: options.ipAddress,
      }
    : undefined;

  return { transactionId, collectionNote, auditInput };
};

const applyStatusChange = async (
  tx: TxClient,
  order: OrderRecord,
  nextStatus: OrderStatus,
): Promise<OrderRecord> => {
  const currentStatus = order.status;

  if (currentStatus === nextStatus) {
    return order;
  }

  if (!ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw ApiError.conflict(
      `Invalid order status transition: ${currentStatus} -> ${nextStatus}`,
    );
  }

  let nextPaymentStatus = order.paymentStatus;
  let refundedAmount = order.refundedAmount;

  if (
    nextStatus === OrderStatus.CANCELLED ||
    nextStatus === OrderStatus.RETURNED
  ) {
    await restoreStockForOrder(
      tx,
      order,
      nextStatus === OrderStatus.RETURNED
        ? InventoryMovementType.ORDER_RETURN
        : InventoryMovementType.ORDER_CANCEL,
    );

    if (order.couponId) {
      await tx.coupon.updateMany({
        where: { id: order.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }

    if (order.payment) {
      if (order.payment.status === PaymentStatus.PAID) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
        nextPaymentStatus = PaymentStatus.REFUNDED;
        refundedAmount = order.payment.amount;

        await recordRefund(
          {
            amount: order.payment.amount,
            date: new Date(),
            description: `Refund for order ${order.orderNumber}`,
            referenceType: "ORDER_REFUND",
            referenceId: order.id,
            metadata: {
              orderId: order.id,
              paymentId: order.payment.id,
              transactionId: order.payment.transactionId,
            },
          },
          tx,
        );
      } else {
        // Any uncollected payment becomes non-collectable when the order is
        // cancelled or returned, including FAILED/PROCESSING payments. The
        // explicit note keeps the audit trail obvious in the cash list.
        await tx.payment.update({
          where: { id: order.payment.id },
          data: {
            status: PaymentStatus.CANCELLED,
            collectionNote: [
              order.payment.collectionNote,
              `Status: Cancelled — not collectable (order ${nextStatus.toLowerCase()})`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        });
        nextPaymentStatus = PaymentStatus.CANCELLED;
      }
    }
  }

  if (
    nextStatus === OrderStatus.DELIVERED &&
    order.payment &&
    order.payment.method === PaymentMethod.CASH_ON_DELIVERY &&
    order.payment.status === PaymentStatus.PENDING
  ) {
    // A delivered COD parcel means the cash is in the courier's hands. Record
    // the collection, ledger income and detailed note automatically.
    const collection = await recordCashCollection(tx, order, {
      automatic: true,
    });

    if (collection) {
      nextPaymentStatus = PaymentStatus.PAID;
    }
  }

  const updatedOrder = await tx.order.update({
    where: { id: order.id },
    data: { status: nextStatus, paymentStatus: nextPaymentStatus, refundedAmount },
    include: orderInclude,
  });

  const title = STATUS_NOTIFICATION_TITLES[nextStatus];

  if (title) {
    await createNotification(
      tx,
      order.userId,
      title,
      `Your order ${order.orderNumber} status is now ${nextStatus}.`,
      "ORDER",
      `Order ${order.orderNumber} status changed to ${nextStatus}.`,
      order.id,
    );
  }

  return updatedOrder;
};

export const updateOrderStatus = async (
  actor: AuthenticatedUser,
  orderId: string,
  input: UpdateOrderStatusInput,
  ipAddress?: string,
): Promise<OrderResponse> => {
  // Audit is deliberately written after commit. Keeping the audit INSERT inside
  // the interactive transaction made long status changes (stock restore,
  // ledger entries, notifications) hit Prisma's 5 s timeout, so the status
  // update rolled back even though the work was otherwise complete.
  const pendingAudit: { input?: AuditInput } = {};

  const updatedOrder = await prisma.$transaction(
    async (tx) => {
      await lockOrderRow(tx, orderId);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });

      if (!order) {
        throw ApiError.notFound("Order not found");
      }

      if (order.status === input.status) {
        return order;
      }

      const result = await applyStatusChange(tx, order, input.status);

      pendingAudit.input = {
        userId: actor.id,
        action: "UPDATE_ORDER_STATUS",
        entity: "Order",
        entityId: order.id,
        description: `Changed order ${order.orderNumber} status from ${order.status} to ${input.status}`,
        oldData: { status: order.status },
        newData: { status: input.status },
        ipAddress,
      };

      return result;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  if (pendingAudit.input) {
    await recordAuditBestEffort(pendingAudit.input);
  }

  return toOrderResponse(updatedOrder);
};

export const collectCashOnDeliveryPayment = async (
  actor: AuthenticatedUser,
  orderId: string,
  input: CollectCodPaymentInput,
  ipAddress?: string,
): Promise<OrderResponse> => {
  const pendingAudit: { input?: AuditInput } = {};

  const updatedOrder = await prisma.$transaction(
    async (tx) => {
      await lockOrderRow(tx, orderId);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });

      if (!order) {
        throw ApiError.notFound("Order not found");
      }

      const collection = await recordCashCollection(tx, order, {
        actor,
        note: input.note,
        reference: input.reference,
        ipAddress,
      });
      pendingAudit.input = collection?.auditInput;

      const refreshed = await tx.order.findUnique({
        where: { id: order.id },
        include: orderInclude,
      });

      if (!refreshed) {
        throw ApiError.notFound("Order not found");
      }

      return refreshed;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );

  if (pendingAudit.input) {
    await recordAuditBestEffort(pendingAudit.input);
  }

  return toOrderResponse(updatedOrder);
};

const deriveCashCollectionStatus = (
  order: OrderResponse,
): CashCollectionStatus => {
  if (
    order.status === OrderStatus.CANCELLED ||
    order.status === OrderStatus.RETURNED
  ) {
    return "CANCELLED";
  }

  const paymentStatus = order.payment?.status;

  if (
    !paymentStatus ||
    paymentStatus === PaymentStatus.CANCELLED ||
    paymentStatus === PaymentStatus.REFUNDED
  ) {
    return "CANCELLED";
  }

  if (paymentStatus === PaymentStatus.PAID || order.payment?.collectedAt) {
    return "COLLECTED";
  }

  return "PENDING";
};

const toCashCollectionItem = (order: OrderResponse): CashCollectionItem => {
  const productNumber = buildProductNumber(order);
  const customerName =
    order.address?.fullName?.trim() || order.customer?.name || "Customer";

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName,
    productNumber: productNumber.value,
    itemCount: productNumber.itemCount,
    status: deriveCashCollectionStatus(order),
    amount: order.payment?.amount ?? order.totalAmount,
    currency: env.STORE_CURRENCY,
    paymentMethod: order.paymentMethod,
    orderStatus: order.status,
    transactionId: order.payment?.transactionId ?? null,
    collectedAt: order.payment?.collectedAt ?? null,
    collectedByName: order.payment?.collectedByName ?? null,
    createdAt: order.createdAt,
  };
};

const cashCollectionStatusWhere = (
  status: CashCollectionStatus,
): Prisma.OrderWhereInput => {
  switch (status) {
    case "COLLECTED":
      return {
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
        payment: { is: { status: PaymentStatus.PAID } },
      };
    case "CANCELLED":
      return {
        OR: [
          { status: { in: [OrderStatus.CANCELLED, OrderStatus.RETURNED] } },
          {
            payment: {
              is: {
                status: { in: [PaymentStatus.CANCELLED, PaymentStatus.REFUNDED] },
              },
            },
          },
        ],
      };
    case "PENDING":
    default:
      return {
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
        payment: {
          is: {
            status: {
              in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.FAILED],
            },
            collectedAt: null,
          },
        },
      };
  }
};

const cashCollectionSearchWhere = (search?: string): Prisma.OrderWhereInput => {
  const term = search?.trim();

  if (!term) {
    return {};
  }

  return {
    OR: [
      { orderNumber: { contains: term, mode: "insensitive" } },
      { user: { name: { contains: term, mode: "insensitive" } } },
      { user: { email: { contains: term, mode: "insensitive" } } },
      {
        payment: {
          is: { transactionId: { contains: term, mode: "insensitive" } },
        },
      },
    ],
  };
};

export const listCashCollections = async (
  query: CashCollectionListQuery,
): Promise<PaginatedCashCollections> => {
  const searchWhere = cashCollectionSearchWhere(query.search);
  const scopedWhere = (status: CashCollectionStatus): Prisma.OrderWhereInput => ({
    AND: [searchWhere, cashCollectionStatusWhere(status)],
  });

  const statusWhere = query.status
    ? scopedWhere(query.status)
    : ({} satisfies Prisma.OrderWhereInput);

  const [orders, total, pendingCount, collectedCount, cancelledCount, pendingAmount, collectedAmount] =
    await Promise.all([
      prisma.order.findMany({
        where: statusWhere,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.order.count({ where: statusWhere }),
      prisma.order.count({ where: scopedWhere("PENDING") }),
      prisma.order.count({ where: scopedWhere("COLLECTED") }),
      prisma.order.count({ where: scopedWhere("CANCELLED") }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { order: { is: scopedWhere("PENDING") } },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { order: { is: scopedWhere("COLLECTED") } },
      }),
    ]);

  const summary: CashCollectionSummary = {
    pendingCount,
    collectedCount,
    cancelledCount,
    pendingAmount: pendingAmount._sum.amount?.toNumber() ?? 0,
    collectedAmount: collectedAmount._sum.amount?.toNumber() ?? 0,
  };

  return {
    items: orders.map((order) => toCashCollectionItem(toOrderResponse(order))),
    meta: buildPaginationMeta(query.page, query.limit, total),
    summary,
  };
};

/**
 * One-click collection. No note/reference is required: this simply marks the
 * order's payment as collected using the existing audited ledger flow.
 */
export const collectCashForOrder = async (
  actor: AuthenticatedUser,
  orderId: string,
  ipAddress?: string,
): Promise<CashCollectionItem> => {
  const order = await collectCashOnDeliveryPayment(
    actor,
    orderId,
    {},
    ipAddress,
  );

  return toCashCollectionItem(order);
};

const TRACKING_STEPS: Array<{ status: OrderStatus; label: string; description: string }> = [
  { status: OrderStatus.PENDING, label: "Order placed", description: "We received your order." },
  { status: OrderStatus.CONFIRMED, label: "Confirmed", description: "Your order has been confirmed." },
  { status: OrderStatus.PROCESSING, label: "Processing", description: "Your items are being prepared." },
  { status: OrderStatus.SHIPPED, label: "Shipped", description: "Your parcel is on its way." },
  { status: OrderStatus.DELIVERED, label: "Delivered", description: "Your order was delivered." },
];

/**
 * Public, read-only order tracking. Deliberately excludes customer name,
 * phone, email, address and receipt URL — an order code alone must not expose
 * personal data. Global rate limiting applies to this endpoint.
 */
export const trackOrder = async (code: string): Promise<OrderTrackingResult> => {
  const normalizedCode = code.trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: { equals: normalizedCode, mode: "insensitive" } },
        { receiptNumber: { equals: normalizedCode, mode: "insensitive" } },
        ...(UUID_PATTERN.test(normalizedCode) ? [{ id: normalizedCode }] : []),
      ],
    },
    select: {
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productName: true,
          productImage: true,
          size: true,
          color: true,
          quantity: true,
          totalPrice: true,
        },
      },
      payment: {
        select: { paidAt: true, collectedAt: true },
      },
    },
  });

  if (!order) {
    throw ApiError.notFound("No order found for that order number or code");
  }

  const currentIndex = TRACKING_STEPS.findIndex(
    (step) => step.status === order.status,
  );
  const isTerminal = order.status === OrderStatus.CANCELLED || order.status === OrderStatus.RETURNED;
  const completedSteps = isTerminal
    ? order.status === OrderStatus.RETURNED
      ? TRACKING_STEPS
      : TRACKING_STEPS.slice(0, 1)
    : TRACKING_STEPS.slice(0, currentIndex + 1);

  const timeline: OrderTrackingEvent[] = completedSteps.map((step, index) => {
    const isLast = index === completedSteps.length - 1;
    const paymentTimestamp =
      step.status === OrderStatus.CONFIRMED
        ? (order.payment?.paidAt ?? order.payment?.collectedAt ?? null)
        : null;

    return {
      label: step.label,
      description: step.description,
      completed: true,
      current: isLast && !isTerminal,
      timestamp: isLast
        ? order.updatedAt.toISOString()
        : index === 0
          ? order.createdAt.toISOString()
          : paymentTimestamp?.toISOString() ?? null,
    };
  });

  if (isTerminal) {
    timeline.push({
      label: order.status === OrderStatus.CANCELLED ? "Cancelled" : "Returned",
      description:
        order.status === OrderStatus.CANCELLED
          ? "This order was cancelled."
          : "This order was returned.",
      completed: true,
      current: true,
      timestamp: order.updatedAt.toISOString(),
    });
  }

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    placedAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    itemCount: order.items.length,
    totalAmount: order.totalAmount.toNumber(),
    items: order.items.map((item) => ({
      productName: item.productName,
      productImage: item.productImage,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      totalPrice: item.totalPrice.toNumber(),
    })),
    timeline,
  };
};

export const cancelOrder = async (
  userId: string,
  orderId: string,
): Promise<OrderResponse> => {
  const updatedOrder = await prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, orderId);

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    if (!order || order.userId !== userId) {
      throw ApiError.notFound("Order not found");
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.CONFIRMED
    ) {
      throw ApiError.badRequest(
        "Only PENDING or CONFIRMED orders can be cancelled",
      );
    }

    return applyStatusChange(tx, order, OrderStatus.CANCELLED);
  }, { maxWait: 10_000, timeout: 20_000 });

  return toOrderResponse(updatedOrder);
};

export const confirmPaymentForOrder = async (
  orderId: string,
  transactionId: string | undefined,
  providerReference: string | undefined,
  providerPaymentId?: string | undefined,
  providerResponse?: Prisma.InputJsonValue | undefined,
): Promise<OrderResponse> => {
  const updatedOrder = await prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, orderId);

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    if (!order || !order.payment) {
      throw ApiError.notFound("Order payment not found");
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.RETURNED
    ) {
      throw ApiError.conflict(
        `Cannot confirm payment for a ${order.status.toLowerCase()} order`,
      );
    }

    if (order.payment.status === PaymentStatus.PAID) {
      await recordIncome(
        {
          amount: order.payment.amount,
          date: order.payment.paidAt ?? new Date(),
          description: `Payment received for order ${order.orderNumber}`,
          referenceType: "PAYMENT",
          referenceId: order.payment.id,
          metadata: { orderId: order.id, method: order.payment.method },
        },
        tx,
      );

      return order;
    }

    if (
      order.payment.status === PaymentStatus.REFUNDED
    ) {
      throw ApiError.conflict(
        `Payment cannot be confirmed because it is ${order.payment.status}`,
      );
    }

    const paidAt = new Date();

    await tx.payment.update({
      where: { id: order.payment.id },
      data: {
        status: PaymentStatus.PAID,
        paidAt,
        transactionId:
          transactionId?.trim() ||
          order.payment.transactionId ||
          generateTransactionId(order.payment.method),
        providerReference: providerReference?.trim() || null,
        providerPaymentId:
          providerPaymentId?.trim() || order.payment.providerPaymentId,
        providerResponse,
      },
    });

    await recordIncome(
      {
        amount: order.payment.amount,
        date: paidAt,
        description: `Payment received for order ${order.orderNumber}`,
        referenceType: "PAYMENT",
        referenceId: order.payment.id,
        metadata: {
          orderId: order.id,
          method: order.payment.method,
          transactionId,
        },
      },
      tx,
    );

    const nextStatus =
      order.status === OrderStatus.PENDING
        ? OrderStatus.CONFIRMED
        : order.status;

    if (nextStatus !== order.status) {
      await applyStatusChange(tx, order, nextStatus);
    }

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.PAID },
    });

    const refreshed = await tx.order.findUnique({
      where: { id: order.id },
      include: orderInclude,
    });

    if (!refreshed) {
      throw ApiError.notFound("Order not found");
    }

    await createNotification(
      tx,
      order.userId,
      "Payment successful",
      `Payment for order ${order.orderNumber} has been completed successfully.`,
      "ORDER",
      `Payment of ${order.payment.amount.toFixed(2)} for order ${order.orderNumber} completed successfully.`,
      order.id,
    );

    return refreshed;
  }, { maxWait: 10_000, timeout: 20_000 });

  return toOrderResponse(updatedOrder);
};

export const markPaymentFailedForOrder = async (
  orderId: string,
  reason?: string,
): Promise<OrderResponse> => {
  const updatedOrder = await prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, orderId);

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    if (!order || !order.payment) {
      throw ApiError.notFound("Order payment not found");
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.RETURNED
    ) {
      throw ApiError.conflict(
        `Cannot mark payment as failed for a ${order.status.toLowerCase()} order`,
      );
    }

    if (order.payment.status === PaymentStatus.FAILED) {
      return order;
    }

    if (order.payment.status === PaymentStatus.PAID) {
      throw ApiError.conflict("Completed payments cannot be marked as failed");
    }

    // Late provider retries can report a failure after the payment was already
    // cancelled or refunded. That is an idempotent no-op, not a conflict.
    if (
      order.payment.status === PaymentStatus.CANCELLED ||
      order.payment.status === PaymentStatus.REFUNDED
    ) {
      return order;
    }

    await tx.payment.update({
      where: { id: order.payment.id },
      data: {
        status: PaymentStatus.FAILED,
        providerReference: reason?.trim() || order.payment.providerReference,
      },
    });

    await deleteLedgerEntry("PAYMENT", order.payment.id, undefined, tx);

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.FAILED },
    });

    await createNotification(
      tx,
      order.userId,
      "Payment failed",
      `Payment for order ${order.orderNumber} could not be completed.`,
      "ORDER",
      `Payment for order ${order.orderNumber} failed${reason?.trim() ? `: ${reason.trim()}` : ""}.`,
      order.id,
    );

    const refreshed = await tx.order.findUnique({
      where: { id: order.id },
      include: orderInclude,
    });

    if (!refreshed) {
      throw ApiError.notFound("Order not found");
    }

    return refreshed;
  }, { maxWait: 10_000, timeout: 20_000 });

  return toOrderResponse(updatedOrder);
};
