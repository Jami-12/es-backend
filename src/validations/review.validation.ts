import { z } from "zod";

const ratingSchema = z.coerce
  .number()
  .int("Rating must be an integer")
  .min(1, "Rating must be at least 1")
  .max(5, "Rating must be at most 5");

export const createReviewSchema = z.object({
  rating: ratingSchema,
  comment: z.string().trim().max(3000).optional(),
});

export const updateReviewSchema = z
  .object({
    rating: ratingSchema.optional(),
    comment: z.string().trim().max(3000).nullable().optional(),
    isApproved: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export const adminReviewListQuerySchema = reviewListQuerySchema.extend({
  productId: z.string().uuid("Invalid product id").optional(),
  userId: z.string().uuid("Invalid user id").optional(),
  isApproved: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});
