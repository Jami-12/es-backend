import type {
  AdminReviewListQuery,
  CreateReviewInput,
  ReviewListQuery,
  UpdateReviewInput,
} from "../../types/review.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as reviewService from "./review.service";

export const listProductReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.listProductReviews(
    req.params.productId,
    req.query as unknown as ReviewListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Reviews retrieved successfully",
  });
});

export const listReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.listReviewsForAdmin(
    req.query as unknown as AdminReviewListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Reviews retrieved successfully",
  });
});

export const createReview = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const review = await reviewService.createReview(
    user.id,
    req.params.productId,
    req.body as CreateReviewInput,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { review },
    message: "Review submitted successfully. It will be visible after approval.",
  });
});

export const updateReview = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const review = await reviewService.updateReview(
    user,
    req.params.id,
    req.body as UpdateReviewInput,
  );

  sendSuccess(res, {
    data: { review },
    message: "Review updated successfully",
  });
});

export const deleteReview = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  await reviewService.deleteReview(user, req.params.id);

  sendSuccess(res, {
    data: { id: req.params.id },
    message: "Review deleted successfully",
  });
});
