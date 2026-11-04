import type { Request } from "express";
import type {
  ProductImageUpdateInput,
  ProductImageUploadInput,
  ReorderProductImagesInput,
} from "../../types/product.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as productImageService from "./product-image.service";

const collectUploadedFiles = (
  files: Request["files"],
): Express.Multer.File[] => {
  if (!files) {
    return [];
  }

  if (Array.isArray(files)) {
    return files;
  }

  return [...(files.images ?? []), ...(files.image ?? [])];
};

export const listProductImages = asyncHandler(async (req, res) => {
  const images = await productImageService.listProductImages(
    req.params.productId,
    req.user,
  );

  sendSuccess(res, {
    data: { images },
    message: "Product images retrieved successfully",
  });
});

export const uploadProductImages = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const images = await productImageService.uploadProductImages(
    actor.id,
    req.params.productId,
    collectUploadedFiles(req.files),
    req.body as ProductImageUploadInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { images },
    message: "Product images uploaded successfully",
  });
});

export const updateProductImage = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const result = await productImageService.updateProductImage(
    actor.id,
    req.params.productId,
    req.params.imageId,
    req.body as ProductImageUpdateInput,
    req.ip,
  );

  sendSuccess(res, {
    data: result,
    message: "Product image updated successfully",
  });
});

export const setPrimaryProductImage = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const result = await productImageService.setPrimaryProductImage(
    actor.id,
    req.params.productId,
    req.params.imageId,
    req.ip,
  );

  sendSuccess(res, {
    data: result,
    message: "Primary product image updated successfully",
  });
});

export const reorderProductImages = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const images = await productImageService.reorderProductImages(
    actor.id,
    req.params.productId,
    req.body as ReorderProductImagesInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { images },
    message: "Product images reordered successfully",
  });
});

export const deleteProductImage = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const result = await productImageService.deleteProductImage(
    actor.id,
    req.params.productId,
    req.params.imageId,
    req.ip,
  );

  sendSuccess(res, {
    data: result,
    message: "Product image deleted successfully",
  });
});
