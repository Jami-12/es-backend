import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  addCartItemSchema,
  updateCartItemSchema,
} from "../../validations/cart.validation";
import * as cartController from "./cart.controller";

const router = Router();

router.use(authenticate, authorize([Role.CUSTOMER]));

router.get("/", cartController.getCart);

router.post(
  "/items",
  validate({ body: addCartItemSchema }),
  cartController.addCartItem,
);

router.patch(
  "/items/:id",
  validate({ params: idParamSchema, body: updateCartItemSchema }),
  cartController.updateCartItem,
);

router.delete(
  "/items/:id",
  validate({ params: idParamSchema }),
  cartController.removeCartItem,
);

router.delete("/", cartController.clearCart);

export const cartRoutes = router;
