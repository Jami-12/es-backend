import type {
  BannerInput,
  BannerListQuery,
  BannerStatusInput,
  BannerUpdateInput,
} from "../../types/banner.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import * as bannerService from "./banner.service";

export const listPublicBanners = asyncHandler(async (req, res) => {
  const banners = await bannerService.listPublicBanners(
    req.query as unknown as BannerListQuery,
  );

  sendSuccess(res, {
    data: { banners },
    message: "Banners retrieved successfully",
  });
});

export const listBanners = asyncHandler(async (req, res) => {
  const banners = await bannerService.listBanners(
    req.query as unknown as BannerListQuery,
  );

  sendSuccess(res, {
    data: { banners },
    message: "Banners retrieved successfully",
  });
});

export const getBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.getBanner(req.params.id);

  sendSuccess(res, {
    data: { banner },
    message: "Banner retrieved successfully",
  });
});

export const createBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.createBanner(
    req.body as BannerInput,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { banner },
    message: "Banner created successfully",
  });
});

export const updateBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.updateBanner(
    req.params.id,
    req.body as BannerUpdateInput,
  );

  sendSuccess(res, {
    data: { banner },
    message: "Banner updated successfully",
  });
});

export const updateBannerStatus = asyncHandler(async (req, res) => {
  const banner = await bannerService.updateBannerStatus(
    req.params.id,
    req.body as BannerStatusInput,
  );

  sendSuccess(res, {
    data: { banner },
    message: "Banner status updated successfully",
  });
});

export const removeBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.removeBanner(req.params.id);

  sendSuccess(res, {
    data: { banner },
    message: "Banner deleted successfully",
  });
});
