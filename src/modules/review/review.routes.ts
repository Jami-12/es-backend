import { Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  adminReviewListQuerySchema,
  createReviewSchema,
  reviewListQuerySchema,
  updateReviewSchema,
} from "../../validations/review.validation";
import * as reviewController from "./review.controller";

const productIdParamSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
});

export const productReviewRoutes = Router({ mergeParams: true });

productReviewRoutes.get(
  "/",
  validate({ params: productIdParamSchema, query: reviewListQuerySchema }),
  reviewController.listProductReviews,
);

productReviewRoutes.post(
  "/",
  authenticate,
  authorize([Role.CUSTOMER]),
  validate({ params: productIdParamSchema, body: createReviewSchema }),
  reviewController.createReview,
);

export const reviewRoutes = Router();

reviewRoutes.get(
  "/",
  authenticate,
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ query: adminReviewListQuerySchema }),
  reviewController.listReviews,
);

reviewRoutes.patch(
  "/:id",
  authenticate,
  validate({ params: idParamSchema, body: updateReviewSchema }),
  reviewController.updateReview,
);

reviewRoutes.delete(
  "/:id",
  authenticate,
  validate({ params: idParamSchema }),
  reviewController.deleteReview,
);
