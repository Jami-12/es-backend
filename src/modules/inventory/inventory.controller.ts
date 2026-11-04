import type {
  AdjustStockInput,
  InventoryListQuery,
  InventoryLogListQuery,
} from "../../types/inventory.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as inventoryService from "./inventory.service";

export const getInventoryOverview = asyncHandler(async (_req, res) => {
  const overview = await inventoryService.getInventoryOverview();

  sendSuccess(res, {
    data: { overview },
    message: "Inventory overview retrieved successfully",
  });
});

export const listInventory = asyncHandler(async (req, res) => {
  const result = await inventoryService.listInventory(
    req.query as unknown as InventoryListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Inventory retrieved successfully",
  });
});

export const getProductInventory = asyncHandler(async (req, res) => {
  const item = await inventoryService.getProductInventory(req.params.productId);

  sendSuccess(res, {
    data: { item },
    message: "Product inventory retrieved successfully",
  });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const item = await inventoryService.adjustStock(
    user,
    req.params.productId,
    req.body as AdjustStockInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { item },
    message: "Stock adjusted successfully",
  });
});

export const listInventoryLogs = asyncHandler(async (req, res) => {
  const result = await inventoryService.listInventoryLogs(
    req.query as unknown as InventoryLogListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Inventory logs retrieved successfully",
  });
});
