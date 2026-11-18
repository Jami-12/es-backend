import type { BannerPlacement, Prisma } from "@prisma/client";

import {
  deleteCloudinaryImage,
  isCloudinaryConfigured,
} from "../../config/cloudinary";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type {
  BannerInput,
  BannerListQuery,
  BannerResponse,
  BannerStatusInput,
  BannerUpdateInput,
} from "../../types/banner.types";

type BannerRecord = Prisma.BannerGetPayload<Record<string, never>>;

const toBannerResponse = (banner: BannerRecord): BannerResponse => ({
  id: banner.id,
  title: banner.title,
  subtitle: banner.subtitle,
  imageUrl: banner.imageUrl,
  publicId: banner.publicId,
  linkUrl: banner.linkUrl,
  placement: banner.placement,
  isActive: banner.isActive,
  sortOrder: banner.sortOrder,
  createdAt: banner.createdAt.toISOString(),
  updatedAt: banner.updatedAt.toISOString(),
});

const placementWhere = (
  placement: BannerPlacement | undefined,
): Prisma.BannerWhereInput =>
  placement ? { placement } : {};

const handleUniqueConflict = (error: unknown): never => {
  if (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  ) {
    throw ApiError.conflict("This image is already attached to a banner");
  }

  throw error;
};

const deleteBannerImage = async (publicId?: string | null): Promise<void> => {
  if (!publicId || !isCloudinaryConfigured) {
    return;
  }

  try {
    await deleteCloudinaryImage(publicId);
  } catch (error) {
    console.error(`Failed to delete Cloudinary banner image ${publicId}:`, error);
  }
};

export const listPublicBanners = async (
  query: BannerListQuery,
): Promise<BannerResponse[]> => {
  const banners = await prisma.banner.findMany({
    where: { isActive: true, ...placementWhere(query.placement) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: query.limit ?? 10,
  });

  return banners.map(toBannerResponse);
};

export const listBanners = async (
  query: BannerListQuery,
): Promise<BannerResponse[]> => {
  const banners = await prisma.banner.findMany({
    where: { ...placementWhere(query.placement) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: query.limit ?? 100,
  });

  return banners.map(toBannerResponse);
};

export const getBanner = async (id: string): Promise<BannerResponse> => {
  const banner = await prisma.banner.findUnique({ where: { id } });

  if (!banner) {
    throw ApiError.notFound("Banner not found");
  }

  return toBannerResponse(banner);
};

export const createBanner = async (
  input: BannerInput,
): Promise<BannerResponse> => {
  try {
    const banner = await prisma.banner.create({
      data: {
        title: input.title,
        subtitle: input.subtitle?.trim() || null,
        imageUrl: input.imageUrl,
        publicId: input.publicId?.trim() || null,
        linkUrl: input.linkUrl?.trim() || null,
        placement: input.placement,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });

    return toBannerResponse(banner);
  } catch (error) {
    return handleUniqueConflict(error);
  }
};

export const updateBanner = async (
  id: string,
  input: BannerUpdateInput,
): Promise<BannerResponse> => {
  const existing = await prisma.banner.findUnique({ where: { id } });

  if (!existing) {
    throw ApiError.notFound("Banner not found");
  }

  try {
    const banner = await prisma.banner.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.subtitle !== undefined && {
          subtitle: input.subtitle?.trim() || null,
        }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.publicId !== undefined && {
          publicId: input.publicId?.trim() || null,
        }),
        ...(input.linkUrl !== undefined && {
          linkUrl: input.linkUrl?.trim() || null,
        }),
        ...(input.placement !== undefined && { placement: input.placement }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });

    if (
      input.publicId &&
      existing.publicId &&
      existing.publicId !== banner.publicId
    ) {
      await deleteBannerImage(existing.publicId);
    }

    return toBannerResponse(banner);
  } catch (error) {
    return handleUniqueConflict(error);
  }
};

export const updateBannerStatus = async (
  id: string,
  input: BannerStatusInput,
): Promise<BannerResponse> => {
  const existing = await prisma.banner.findUnique({ where: { id } });

  if (!existing) {
    throw ApiError.notFound("Banner not found");
  }

  const banner = await prisma.banner.update({
    where: { id },
    data: { isActive: input.isActive },
  });

  return toBannerResponse(banner);
};

export const removeBanner = async (
  id: string,
): Promise<BannerResponse> => {
  const existing = await prisma.banner.findUnique({ where: { id } });

  if (!existing) {
    throw ApiError.notFound("Banner not found");
  }

  await prisma.banner.delete({ where: { id } });
  await deleteBannerImage(existing.publicId);

  return toBannerResponse(existing);
};
