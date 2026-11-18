import type {
  BrandListQuery,
  CreateBrandInput,
  UpdateBrandInput,
  UpdateBrandStatusInput,
} from "../../types/brand.types";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/ApiResponse";
import { getAuthUser } from "../../utils/auth";
import * as brandService from "./brand.service";

export const listBrands = asyncHandler(async (req, res) => {
  const result = await brandService.listBrands(
    req.query as unknown as BrandListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Brands retrieved successfully",
  });
});

export const getBrand = asyncHandler(async (req, res) => {
  const brand = await brandService.getBrandById(req.params.id);

  sendSuccess(res, {
    data: { brand },
    message: "Brand retrieved successfully",
  });
});

export const createBrand = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const brand = await brandService.createBrand(
    actor.id,
    req.body as CreateBrandInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { brand },
    message: "Brand created successfully",
  });
});

export const updateBrand = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const brand = await brandService.updateBrand(
    actor.id,
    req.params.id,
    req.body as UpdateBrandInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { brand },
    message: "Brand updated successfully",
  });
});

export const updateBrandStatus = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const brand = await brandService.updateBrandStatus(
    actor.id,
    req.params.id,
    req.body as UpdateBrandStatusInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { brand },
    message: "Brand status updated successfully",
  });
});

export const deleteBrand = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  await brandService.deleteBrand(actor.id, req.params.id, req.ip);

  sendSuccess(res, {
    data: { id: req.params.id },
    message: "Brand deleted successfully",
  });
});
