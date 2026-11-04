import {
  OrderStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { buildPaginationMeta } from "../../utils/pagination";
import type {
  AdminReviewListQuery,
  CreateReviewInput,
  ProductReviewsResult,
  ReviewListQuery,
  ReviewResponse,
  UpdateReviewInput,
} from "../../types/review.types";

const reviewInclude = {
  user: {
    select: { id: true, name: true, image: true },
  },
} satisfies Prisma.ReviewInclude;

type ReviewRecord = Prisma.ReviewGetPayload<{
  include: typeof reviewInclude;
}>;

const toReviewResponse = (review: ReviewRecord): ReviewResponse => ({
  id: review.id,
  userId: review.userId,
  productId: review.productId,
  rating: review.rating,
  comment: review.comment,
  isApproved: review.isApproved,
  createdAt: review.createdAt.toISOString(),
  updatedAt: review.updatedAt.toISOString(),
  user: review.user,
});

export const listProductReviews = async (
  productId: string,
  query: ReviewListQuery,
): Promise<ProductReviewsResult> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true },
  });

  if (!product || product.status !== "ACTIVE") {
    throw ApiError.notFound("Product not found");
  }

  const where: Prisma.ReviewWhereInput = {
    productId,
    isApproved: true,
  };

  if (query.rating !== undefined) {
    where.rating = query.rating;
  }

  const skip = (query.page - 1) * query.limit;

  const [reviews, total, aggregate] = await Promise.all([
    prisma.review.findMany({
      where,
      include: reviewInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({
      where: { productId, isApproved: true },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const averageRating = aggregate._avg.rating
    ? Math.round(aggregate._avg.rating * 10) / 10
    : 0;

  return {
    items: reviews.map(toReviewResponse),
    averageRating,
    reviewCount: aggregate._count._all,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const listReviewsForAdmin = async (
  query: AdminReviewListQuery,
): Promise<{
  items: ReviewResponse[];
  meta: ReturnType<typeof buildPaginationMeta>;
}> => {
  const where: Prisma.ReviewWhereInput = {};

  if (query.productId) where.productId = query.productId;
  if (query.userId) where.userId = query.userId;
  if (query.rating !== undefined) where.rating = query.rating;
  if (typeof query.isApproved === "boolean") {
    where.isApproved = query.isApproved;
  }

  const skip = (query.page - 1) * query.limit;

  const [reviews, total] = await prisma.$transaction([
    prisma.review.findMany({
      where,
      include: reviewInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: query.limit,
    }),
    prisma.review.count({ where }),
  ]);

  return {
    items: reviews.map(toReviewResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const createReview = async (
  userId: string,
  productId: string,
  input: CreateReviewInput,
): Promise<ReviewResponse> => {
  if (input.rating < 1 || input.rating > 5) {
    throw ApiError.badRequest("Rating must be between 1 and 5");
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true },
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  const deliveredOrder = await prisma.order.findFirst({
    where: {
      userId,
      status: OrderStatus.DELIVERED,
      items: { some: { productId } },
    },
    select: { id: true },
  });

  if (!deliveredOrder) {
    throw ApiError.forbidden(
      "You can only review products from orders that have been delivered",
    );
  }

  const existing = await prisma.review.findUnique({
    where: {
      userId_productId: { userId, productId },
    },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict("You have already reviewed this product");
  }

  const review = await prisma.review.create({
    data: {
      userId,
      productId,
      rating: input.rating,
      comment: input.comment?.trim() || null,
      isApproved: false,
    },
    include: reviewInclude,
  });

  return toReviewResponse(review);
};

export const updateReview = async (
  requester: { id: string; role: Role },
  reviewId: string,
  input: UpdateReviewInput,
): Promise<ReviewResponse> => {
  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      userId: true,
      rating: true,
      comment: true,
      isApproved: true,
    },
  });

  if (!existing) {
    throw ApiError.notFound("Review not found");
  }

  const isAdmin =
    requester.role === Role.ADMIN || requester.role === Role.SUPER_ADMIN;

  if (!isAdmin && existing.userId !== requester.id) {
    throw ApiError.notFound("Review not found");
  }

  if (!isAdmin && input.isApproved !== undefined) {
    throw ApiError.forbidden("Only administrators can approve reviews");
  }

  const data: Prisma.ReviewUpdateInput = {};

  if (input.rating !== undefined) {
    if (input.rating < 1 || input.rating > 5) {
      throw ApiError.badRequest("Rating must be between 1 and 5");
    }

    data.rating = input.rating;
  }

  if (input.comment !== undefined) {
    data.comment = input.comment?.trim() || null;
  }

  if (
    !isAdmin &&
    (input.rating !== undefined || input.comment !== undefined)
  ) {
    data.isApproved = false;
  }

  if (isAdmin && input.isApproved !== undefined) {
    data.isApproved = input.isApproved;
  }

  const review = await prisma.review.update({
    where: { id: reviewId },
    data,
    include: reviewInclude,
  });

  return toReviewResponse(review);
};

export const deleteReview = async (
  requester: { id: string; role: Role },
  reviewId: string,
): Promise<void> => {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, userId: true },
  });

  if (!review) {
    throw ApiError.notFound("Review not found");
  }

  const isAdmin =
    requester.role === Role.ADMIN || requester.role === Role.SUPER_ADMIN;

  if (!isAdmin && review.userId !== requester.id) {
    throw ApiError.notFound("Review not found");
  }

  await prisma.review.delete({ where: { id: reviewId } });
};
