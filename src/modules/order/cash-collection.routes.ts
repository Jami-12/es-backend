import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import { cashCollectionListQuerySchema } from "../../validations/order.validation";
import * as cashCollectionController from "./cash-collection.controller";

const router = Router();

router.use(authenticate, authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.get(
  "/",
  validate({ query: cashCollectionListQuerySchema }),
  cashCollectionController.listCashCollections,
);

router.patch(
  "/:id/collect",
  validate({ params: idParamSchema }),
  cashCollectionController.collectCash,
);

export const cashCollectionRoutes = router;
