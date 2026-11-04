import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as wishlistService from "./wishlist.service";

export const listWishlist = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await wishlistService.listWishlist(user.id);

  sendSuccess(res, {
    data: result,
    message: "Wishlist retrieved successfully",
  });
});

export const addToWishlist = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const item = await wishlistService.addToWishlist(
    user.id,
    req.params.productId,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { item },
    message: "Product added to wishlist",
  });
});

export const removeFromWishlist = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  await wishlistService.removeFromWishlist(user.id, req.params.productId);

  sendSuccess(res, {
    data: { productId: req.params.productId },
    message: "Product removed from wishlist",
  });
});
