import type {
  ProductDiscountInput,
  UpdateProductDiscountInput,
} from "../../types/product.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as productDiscountService from "./product-discount.service";

export const getProductDiscount = asyncHandler(async (req, res) => {
  const discount = await productDiscountService.getProductDiscount(
    req.params.productId,
  );

  sendSuccess(res, {
    data: { discount },
    message: discount
      ? "Product discount retrieved successfully"
      : "This product does not have a discount",
  });
});

export const createProductDiscount = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const discount = await productDiscountService.createProductDiscount(
    actor.id,
    req.params.productId,
    req.body as ProductDiscountInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { discount },
    message: "Product discount created successfully",
  });
});

export const updateProductDiscount = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const discount = await productDiscountService.updateProductDiscount(
    actor.id,
    req.params.productId,
    req.body as UpdateProductDiscountInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { discount },
    message: "Product discount updated successfully",
  });
});

export const deleteProductDiscount = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  await productDiscountService.deleteProductDiscount(
    actor.id,
    req.params.productId,
    req.ip,
  );

  sendSuccess(res, {
    data: { productId: req.params.productId },
    message: "Product discount removed successfully",
  });
});
