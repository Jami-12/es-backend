import { randomUUID } from "node:crypto";
import {
  InventoryMovementType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { deleteLedgerEntry, recordIncome, recordRefund } from "../../utils/ledger";
import {
  calculateShippingCost,
  roundMoney,
  toDecimal,
} from "../../utils/money";
import { resolveProductPricing } from "../../utils/productPricing";
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
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  CheckoutInput,
  OrderListQuery,
  OrderResponse,
  PaginatedOrders,
  ReceiptData,
  UpdateOrderStatusInput,
} from "../../types/order.types";

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
  type: "ORDER" | "PAYMENT" = "ORDER",
): Promise<void> => {
  await tx.notification.create({
    data: { userId, title, message, type },
  });
};

const lockCartRow = async (tx: TxClient, userId: string): Promise<void> => {
  await tx.$queryRaw`SELECT "id" FROM "carts" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
};

const lockOrderRow = async (tx: TxClient, orderId: string): Promise<void> => {
  await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
};

export const checkout = async (
  userId: string,
  input: CheckoutInput,
): Promise<OrderResponse> => {
  const order = await prisma.$transaction(async (tx) => {
    await lockCartRow(tx, userId);

    const cart = await tx.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: {
                  orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                  take: 1,
                },
                discount: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw ApiError.badRequest("Your cart is empty");
    }

    const address = await tx.address.findFirst({
      where: { id: input.addressId, userId },
    });

    if (!address) {
      throw ApiError.notFound("Shipping address not found");
    }

    let subtotal = new Prisma.Decimal(0);
    let totalProductCost = new Prisma.Decimal(0);
    const cartItemIds: string[] = [];
    const orderItems: {
      cartItemId: string;
      productId: string;
      productName: string;
      productImage: string | null;
      sku: string;
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

    for (const item of cart.items) {
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

      const pricing = resolveProductPricing(product.price, product.discount);
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

    let discountAmount = new Prisma.Decimal(0);
    let couponId: string | null = null;
    let couponUsageLimit: number | null = null;

    if (input.couponCode) {
      const { coupon, discountAmount: discount } = await resolveCoupon(
        input.couponCode,
        subtotal.toNumber(),
        tx,
      );

      discountAmount = toDecimal(discount);
      couponId = coupon.id;
      couponUsageLimit = coupon.usageLimit;
    }

    const discountedSubtotal = subtotal.minus(discountAmount);
    const shippingCost = toDecimal(
      calculateShippingCost(
        discountedSubtotal.toNumber(),
        env.SHIPPING_FLAT_RATE,
        env.FREE_SHIPPING_THRESHOLD,
      ),
    );
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
        userId,
        addressId: address.id,
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

    await tx.cartItem.deleteMany({
      where: { id: { in: cartItemIds } },
    });

    await createNotification(
      tx,
      userId,
      "Order placed",
      `Your order ${createdOrder.orderNumber} has been placed successfully.`,
      "ORDER",
    );

    if (input.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
      await createNotification(
        tx,
        userId,
        "Order confirmed",
        `Your order ${createdOrder.orderNumber} is confirmed. Payment will be collected on delivery.`,
        "ORDER",
      );
    }

    return createdOrder;
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

export const getOrderById = async (
  requester: AuthenticatedUser,
  orderId: string,
): Promise<OrderResponse> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });

  if (!order) {
    throw ApiError.notFound("Order not found");
  }

  const isOwner = order.userId === requester.id;
  const canManageAllOrders =
    requester.role === Role.ADMIN || requester.role === Role.SUPER_ADMIN;

  if (!isOwner && !canManageAllOrders) {
    throw ApiError.notFound("Order not found");
  }

  return toOrderResponse(order);
};

export const getOrderReceipt = async (
  requester: AuthenticatedUser,
  orderId: string,
): Promise<ReceiptData> => {
  const order = await getOrderById(requester, orderId);
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
      } else if (
        order.payment.status === PaymentStatus.PENDING ||
        order.payment.status === PaymentStatus.PROCESSING
      ) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: PaymentStatus.CANCELLED },
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
    const paidAt = new Date();
    await tx.payment.update({
      where: { id: order.payment.id },
      data: {
        status: PaymentStatus.PAID,
        paidAt,
      },
    });
    nextPaymentStatus = PaymentStatus.PAID;

    await recordIncome(
      {
        amount: order.payment.amount,
        date: paidAt,
        description: `Cash on delivery collected for order ${order.orderNumber}`,
        referenceType: "PAYMENT",
        referenceId: order.payment.id,
        metadata: { orderId: order.id, method: order.payment.method },
      },
      tx,
    );
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
      nextStatus === OrderStatus.DELIVERED ? "PAYMENT" : "ORDER",
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
  const updatedOrder = await prisma.$transaction(async (tx) => {
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

    await recordAudit(
      {
        userId: actor.id,
        action: "UPDATE_ORDER_STATUS",
        entity: "Order",
        entityId: order.id,
        description: `Changed order ${order.orderNumber} status from ${order.status} to ${input.status}`,
        oldData: { status: order.status },
        newData: { status: input.status },
        ipAddress,
      },
      tx,
    );

    return result;
  });

  return toOrderResponse(updatedOrder);
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
  });

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
      order.payment.status === PaymentStatus.CANCELLED ||
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
      "PAYMENT",
    );

    return refreshed;
  });

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

    if (
      order.payment.status === PaymentStatus.CANCELLED ||
      order.payment.status === PaymentStatus.REFUNDED
    ) {
      throw ApiError.conflict(
        `Payment cannot be marked as failed because it is ${order.payment.status}`,
      );
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
      "PAYMENT",
    );

    const refreshed = await tx.order.findUnique({
      where: { id: order.id },
      include: orderInclude,
    });

    if (!refreshed) {
      throw ApiError.notFound("Order not found");
    }

    return refreshed;
  });

  return toOrderResponse(updatedOrder);
};
