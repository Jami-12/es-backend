import type { PaginatedResult } from "./common.types";

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  image?: string | null;
}

export interface CategoryListQuery {
  search?: string;
}

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedCategories = PaginatedResult<CategoryResponse>;
