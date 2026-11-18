import type { PaginatedResult } from "./common.types";

export interface CreateBrandInput {
  name: string;
  slug?: string;
  logo?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateBrandInput {
  name?: string;
  slug?: string;
  logo?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateBrandStatusInput {
  isActive: boolean;
}

export interface BrandListQuery {
  search?: string;
  isActive?: boolean;
}

export interface BrandResponse {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  description: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedBrands = PaginatedResult<BrandResponse>;
