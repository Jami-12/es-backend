import type {
  CategoryListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../../types/category.types";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/ApiResponse";
import { getAuthUser } from "../../utils/auth";
import * as categoryService from "./category.service";

export const listCategories = asyncHandler(async (req, res) => {
  const result = await categoryService.listCategories(
    req.query as unknown as CategoryListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Categories retrieved successfully",
  });
});

export const getCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);

  sendSuccess(res, {
    data: { category },
    message: "Category retrieved successfully",
  });
});

export const createCategory = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const category = await categoryService.createCategory(
    actor.id,
    req.body as CreateCategoryInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { category },
    message: "Category created successfully",
  });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const category = await categoryService.updateCategory(
    actor.id,
    req.params.id,
    req.body as UpdateCategoryInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { category },
    message: "Category updated successfully",
  });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  await categoryService.deleteCategory(actor.id, req.params.id, req.ip);

  sendSuccess(res, {
    data: { id: req.params.id },
    message: "Category deleted successfully",
  });
});
