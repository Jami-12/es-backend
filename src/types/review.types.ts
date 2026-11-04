import type { PaginatedResult } from "./common.types";

export interface CreateReviewInput {
  rating: number;
  comment?: string;
}

export interface UpdateReviewInput {
  rating?: number;
  comment?: string | null;
  isApproved?: boolean;
}

export interface ReviewListQuery {
  page: number;
  limit: number;
  rating?: number;
}

export interface AdminReviewListQuery extends ReviewListQuery {
  productId?: string;
  userId?: string;
  isApproved?: boolean;
}

export interface ReviewUserSummary {
  id: string;
  name: string;
  image: string | null;
}

export interface ReviewResponse {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  comment: string | null;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
  user: ReviewUserSummary;
}

export interface ProductReviewsResult {
  items: ReviewResponse[];
  averageRating: number;
  reviewCount: number;
  meta: PaginatedResult<ReviewResponse>["meta"];
}
