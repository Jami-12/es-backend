import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  adjustStockSchema,
  inventoryListQuerySchema,
  inventoryLogListQuerySchema,
  inventoryProductParamSchema,
} from "../../validations/inventory.validation";
import * as inventoryController from "./inventory.controller";

const router = Router();

router.use(authenticate);
router.use(authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.get("/overview", inventoryController.getInventoryOverview);

router.get(
  "/logs",
  validate({ query: inventoryLogListQuerySchema }),
  inventoryController.listInventoryLogs,
);

router.get(
  "/",
  validate({ query: inventoryListQuerySchema }),
  inventoryController.listInventory,
);

router.get(
  "/:productId",
  validate({ params: inventoryProductParamSchema }),
  inventoryController.getProductInventory,
);

router.post(
  "/:productId/adjust",
  validate({
    params: inventoryProductParamSchema,
    body: adjustStockSchema,
  }),
  inventoryController.adjustStock,
);

export const inventoryRoutes = router;
