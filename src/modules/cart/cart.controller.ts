import type {
  AddCartItemInput,
  UpdateCartItemInput,
} from "../../types/cart.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as cartService from "./cart.service";

export const getCart = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const cart = await cartService.getCart(user.id);

  sendSuccess(res, {
    data: { cart },
    message: "Cart retrieved successfully",
  });
});

export const addCartItem = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const cart = await cartService.addCartItem(
    user.id,
    req.body as AddCartItemInput,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { cart },
    message: "Item added to cart",
  });
});

export const updateCartItem = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const cart = await cartService.updateCartItem(
    user.id,
    req.params.id,
    req.body as UpdateCartItemInput,
  );

  sendSuccess(res, {
    data: { cart },
    message: "Cart item updated successfully",
  });
});

export const removeCartItem = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const cart = await cartService.removeCartItem(user.id, req.params.id);

  sendSuccess(res, {
    data: { cart },
    message: "Item removed from cart",
  });
});

export const clearCart = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const cart = await cartService.clearCart(user.id);

  sendSuccess(res, {
    data: { cart },
    message: "Cart cleared successfully",
  });
});
