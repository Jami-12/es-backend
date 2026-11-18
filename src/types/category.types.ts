import type { PaginatedResult } from "./common.types";

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  image?: string | null;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  image?: string | null;
  isActive?: boolean;
}

export interface UpdateCategoryStatusInput {
  isActive: boolean;
}

export interface CategoryListQuery {
  search?: string;
  isActive?: boolean;
}

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedCategories = PaginatedResult<CategoryResponse>;
