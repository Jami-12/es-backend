import {
  InventoryMovementType,
  Prisma,
} from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { endOfDay, startOfDay } from "../../utils/dateRange";
import { effectivePrice } from "../../utils/money";
import { buildPaginationMeta } from "../../utils/pagination";
import type { AuthenticatedUser } from "../../types/auth.types";
import type {
  AdjustStockInput,
  InventoryItem,
  InventoryListQuery,
  InventoryLogListQuery,
  InventoryLogResponse,
  InventoryOverview,
  PaginatedInventory,
  PaginatedInventoryLogs,
} from "../../types/inventory.types";

const inventoryProductSelect = {
  id: true,
  title: true,
  sku: true,
  stock: true,
  minimumStockLevel: true,
  purchasePrice: true,
  price: true,
  discountPrice: true,
  status: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

type InventoryProduct = Prisma.ProductGetPayload<{
  select: typeof inventoryProductSelect;
}>;

const toInventoryItem = (product: InventoryProduct): InventoryItem => {
  const sellingPrice = effectivePrice(
    product.price,
    product.discountPrice,
  ).toNumber();
  const purchasePrice = product.purchasePrice.toNumber();

  return {
    id: product.id,
    title: product.title,
    sku: product.sku,
    stock: product.stock,
    minimumStockLevel: product.minimumStockLevel,
    purchasePrice,
    sellingPrice,
    stockValue: Number((purchasePrice * product.stock).toFixed(2)),
    potentialSellingValue: Number((sellingPrice * product.stock).toFixed(2)),
    status: product.status,
    isLowStock: product.stock <= product.minimumStockLevel,
    isOutOfStock: product.stock <= 0,
    category: product.category,
  };
};

const getLowStockProductIds = async (): Promise<string[]> => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM products WHERE stock <= "minimumStockLevel"
  `;

  return rows.map((row) => row.id);
};

export const listInventory = async (
  query: InventoryListQuery,
): Promise<PaginatedInventory> => {
  const where: Prisma.ProductWhereInput = {};

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { sku: { contains: query.search, mode: "insensitive" } },
    ];
  }

  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.lowStockOnly) {
    const lowStockIds = await getLowStockProductIds();
    where.id = { in: lowStockIds };
  }

  const skip = (query.page - 1) * query.limit;

  if (query.sortBy === "stockValue") {
    const products = await prisma.product.findMany({
      where,
      select: inventoryProductSelect,
    });

    const items = products.map(toInventoryItem).sort((left, right) => {
      const difference = left.stockValue - right.stockValue;
      return query.sortOrder === "asc" ? difference : -difference;
    });

    return {
      items: items.slice(skip, skip + query.limit),
      meta: buildPaginationMeta(query.page, query.limit, items.length),
    };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    query.sortBy === "stock"
      ? { stock: query.sortOrder }
      : query.sortBy === "title"
        ? { title: query.sortOrder }
        : { updatedAt: query.sortOrder };

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: inventoryProductSelect,
      orderBy,
      skip,
      take: query.limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: products.map(toInventoryItem),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getInventoryOverview = async (): Promise<InventoryOverview> => {
  const lowStockIds = await getLowStockProductIds();

  const [totals, products, outOfStockCount, lowStockItems] = await Promise.all([
    prisma.product.aggregate({
      _count: { _all: true },
      _sum: { stock: true },
    }),
    prisma.product.findMany({
      select: {
        stock: true,
        purchasePrice: true,
        price: true,
        discountPrice: true,
      },
    }),
    prisma.product.count({ where: { stock: { lte: 0 } } }),
    prisma.product.findMany({
      where: { id: { in: lowStockIds } },
      select: inventoryProductSelect,
      orderBy: { stock: "asc" },
      take: 10,
    }),
  ]);

  const values = products.reduce(
    (accumulator, product) => {
      const purchasePrice = product.purchasePrice.toNumber();
      const sellingPrice = effectivePrice(
        product.price,
        product.discountPrice,
      ).toNumber();

      accumulator.cost += purchasePrice * product.stock;
      accumulator.potential += sellingPrice * product.stock;

      return accumulator;
    },
    { cost: 0, potential: 0 },
  );

  return {
    currency: env.STORE_CURRENCY,
    totalProducts: totals._count._all,
    totalUnits: totals._sum.stock ?? 0,
    inventoryCostValue: Number(values.cost.toFixed(2)),
    potentialSellingValue: Number(values.potential.toFixed(2)),
    lowStockCount: lowStockIds.length,
    outOfStockCount,
    lowStockItems: lowStockItems.map(toInventoryItem),
  };
};

export const getProductInventory = async (
  productId: string,
): Promise<InventoryItem> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: inventoryProductSelect,
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  return toInventoryItem(product);
};

export const adjustStock = async (
  actor: AuthenticatedUser,
  productId: string,
  input: AdjustStockInput,
  ipAddress?: string,
): Promise<InventoryItem> => {
  const product = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; stock: number }>>`
      SELECT id, stock FROM products WHERE id = ${productId}::uuid FOR UPDATE
    `;

    const current = locked[0];

    if (!current) {
      throw ApiError.notFound("Product not found");
    }

    const previousStock = current.stock;
    let newStock = previousStock;
    let movementQuantity = input.quantity;

    if (input.movementType === InventoryMovementType.STOCK_IN) {
      newStock = previousStock + input.quantity;
    } else if (input.movementType === InventoryMovementType.STOCK_OUT) {
      newStock = previousStock - input.quantity;

      if (newStock < 0) {
        throw ApiError.badRequest(
          `Insufficient stock. Available quantity is ${previousStock}`,
        );
      }

      movementQuantity = -input.quantity;
    } else {
      newStock = input.quantity;
      movementQuantity = newStock - previousStock;
    }

    const updated = await tx.product.update({
      where: { id: productId },
      data: { stock: newStock },
      select: inventoryProductSelect,
    });

    await tx.inventoryLog.create({
      data: {
        productId,
        movementType: input.movementType,
        quantity: movementQuantity,
        previousStock,
        newStock,
        reason: input.reason?.trim() || null,
        referenceType: "MANUAL",
        createdById: actor.id,
      },
    });

    return updated;
  });

  await recordAudit({
    userId: actor.id,
    action: "ADJUST_STOCK",
    entity: "Product",
    entityId: product.id,
    description: `${input.movementType} adjustment of ${input.quantity} applied to ${product.title}`,
    newData: {
      stock: product.stock,
      movementType: input.movementType,
      quantity: input.quantity,
      reason: input.reason ?? null,
    },
    ipAddress,
  });

  return toInventoryItem(product);
};

export const listInventoryLogs = async (
  query: InventoryLogListQuery,
): Promise<PaginatedInventoryLogs> => {
  const where: Prisma.InventoryLogWhereInput = {};

  if (query.productId) {
    where.productId = query.productId;
  }

  if (query.movementType) {
    where.movementType = query.movementType;
  }

  if (query.startDate || query.endDate) {
    where.createdAt = {
      ...(query.startDate && { gte: startOfDay(query.startDate) }),
      ...(query.endDate && { lte: endOfDay(query.endDate) }),
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [logs, total] = await prisma.$transaction([
    prisma.inventoryLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.inventoryLog.count({ where }),
  ]);

  const items: InventoryLogResponse[] = logs.map((log) => ({
    id: log.id,
    productId: log.productId,
    movementType: log.movementType,
    quantity: log.quantity,
    previousStock: log.previousStock,
    newStock: log.newStock,
    reason: log.reason,
    referenceType: log.referenceType,
    referenceId: log.referenceId,
    createdById: log.createdById,
    createdAt: log.createdAt.toISOString(),
  }));

  return {
    items,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};
