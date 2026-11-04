import type { InventoryMovementType, ProductStatus } from "@prisma/client";
import type { PaginatedResult } from "./common.types";

export interface InventoryListQuery {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  lowStockOnly?: boolean;
  sortBy: "stock" | "stockValue" | "title" | "updatedAt";
  sortOrder: "asc" | "desc";
}

export interface InventoryItem {
  id: string;
  title: string;
  sku: string;
  stock: number;
  minimumStockLevel: number;
  purchasePrice: number;
  sellingPrice: number;
  stockValue: number;
  potentialSellingValue: number;
  status: ProductStatus;
  isLowStock: boolean;
  isOutOfStock: boolean;
  category: { id: string; name: string };
}

export interface InventoryOverview {
  currency: string;
  totalProducts: number;
  totalUnits: number;
  inventoryCostValue: number;
  potentialSellingValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockItems: InventoryItem[];
}

export interface AdjustStockInput {
  movementType: InventoryMovementType;
  quantity: number;
  reason?: string;
}

export interface InventoryLogResponse {
  id: string;
  productId: string;
  movementType: InventoryMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface InventoryLogListQuery {
  page: number;
  limit: number;
  productId?: string;
  movementType?: InventoryMovementType;
  startDate?: Date;
  endDate?: Date;
}

export type PaginatedInventory = PaginatedResult<InventoryItem>;
export type PaginatedInventoryLogs = PaginatedResult<InventoryLogResponse>;
