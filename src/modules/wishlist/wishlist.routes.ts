import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { z } from "zod";
import * as wishlistController from "./wishlist.controller";

const productIdParamSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
});

const router = Router();

router.use(authenticate, authorize([Role.CUSTOMER]));

router.get("/", wishlistController.listWishlist);

router.post(
  "/:productId",
  validate({ params: productIdParamSchema }),
  wishlistController.addToWishlist,
);

router.delete(
  "/:productId",
  validate({ params: productIdParamSchema }),
  wishlistController.removeFromWishlist,
);

export const wishlistRoutes = router;
