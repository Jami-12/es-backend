import type { PaginatedResult } from "./common.types";

export interface CreateBrandInput {
  name: string;
  slug?: string;
  logo?: string;
  description?: string;
}

export interface UpdateBrandInput {
  name?: string;
  slug?: string;
  logo?: string | null;
  description?: string | null;
}

export interface BrandListQuery {
  search?: string;
}

export interface BrandResponse {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  description: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedBrands = PaginatedResult<BrandResponse>;
