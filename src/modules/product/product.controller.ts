import type {
  CreateProductInput,
  ProductListQuery,
  UpdateProductInput,
  UpdateProductStatusInput,
} from "../../types/product.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as productService from "./product.service";

export const createProduct = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const product = await productService.createProduct(
    actor.id,
    req.body as CreateProductInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { product },
    message: "Product created successfully",
  });
});

export const listProducts = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(
    req.query as unknown as ProductListQuery,
    req.user,
  );

  sendSuccess(res, {
    data: result,
    message: "Products retrieved successfully",
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id, req.user);

  sendSuccess(res, {
    data: { product },
    message: "Product retrieved successfully",
  });
});

export const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(
    req.params.slug,
    req.user,
  );

  sendSuccess(res, {
    data: { product },
    message: "Product retrieved successfully",
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const product = await productService.updateProduct(
    actor.id,
    req.params.id,
    req.body as UpdateProductInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { product },
    message: "Product updated successfully",
  });
});

export const updateProductStatus = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const product = await productService.updateProductStatus(
    actor.id,
    req.params.id,
    req.body as UpdateProductStatusInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { product },
    message: "Product status updated successfully",
  });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  await productService.deleteProduct(actor.id, req.params.id, req.ip);

  sendSuccess(res, {
    data: { id: req.params.id },
    message: "Product deleted successfully",
  });
});
