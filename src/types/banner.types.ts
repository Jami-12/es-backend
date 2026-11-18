import type { BannerPlacement } from "@prisma/client";

export interface BannerInput {
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  publicId?: string | null;
  linkUrl?: string | null;
  placement: BannerPlacement;
  isActive: boolean;
  sortOrder: number;
}

export type BannerUpdateInput = Partial<BannerInput>;

export interface BannerStatusInput {
  isActive: boolean;
}

export interface BannerListQuery {
  placement?: BannerPlacement;
  limit?: number;
}

export interface BannerResponse {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  publicId: string | null;
  linkUrl: string | null;
  placement: BannerPlacement;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
