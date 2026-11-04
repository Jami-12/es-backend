import type { DiscountType, ProductStatus } from "@prisma/client";
import type { PaginatedResult } from "./common.types";

export interface ProductImageInput {
  url?: string;
  imageUrl?: string;
  publicId?: string;
  altText?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface ProductImageUploadInput {
  altText?: string;
  altTexts?: string[];
  isPrimary?: boolean;
}

export interface ProductImageUpdateInput {
  altText?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface ReorderProductImagesInput {
  imageIds: string[];
}

export interface CreateProductInput {
  title: string;
  slug?: string;
  sku: string;
  description: string;
  shortDescription?: string;
  price: number;
  discountPrice?: number;
  costPrice?: number;
  purchasePrice?: number;
  stock: number;
  minimumStockLevel?: number;
  status?: ProductStatus;
  isFeatured?: boolean;
  categoryId: string;
  brandId?: string | null;
  brandName?: string | null;
  modelUrl?: string;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scale?: number;
  images?: ProductImageInput[];
  thumbnail?: string;
}

export type UpdateProductInput = Partial<CreateProductInput> & {
  thumbnail?: string | null;
};

export interface ProductListQuery {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: ProductStatus;
  featured?: boolean;
  inStock?: boolean;
  sortBy: "createdAt" | "price" | "title" | "soldCount";
  sortOrder: "asc" | "desc";
}

export interface ProductImageResponse {
  id: string;
  productId: string;
  imageUrl: string;
  url: string;
  publicId: string | null;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategorySummary {
  id: string;
  name: string;
  slug: string;
}

export interface ProductBrandSummary {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

export interface ProductDiscountResponse {
  id: string | null;
  type: DiscountType;
  value: number;
  amount: number;
  startDate: string | null;
  endDate: string | null;
}

export interface ProductResponse {
  id: string;
  title: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription: string | null;
  price: number;
  originalPrice: number;
  discountPrice: number | null;
  discount: ProductDiscountResponse | null;
  sellingPrice: number;
  finalPrice: number;
  purchasePrice: number | null;
  stock: number;
  minimumStockLevel: number;
  soldCount: number;
  status: ProductStatus;
  isFeatured: boolean;
  isArchived: boolean;
  archivedAt: string | null;
  category: ProductCategorySummary;
  brand: ProductBrandSummary | null;
  images: ProductImageResponse[];
  thumbnail: string | null;
  modelUrl: string | null;
  positionX: number;
  positionY: number;
  positionZ: number;
  wallPositionX: number;
  wallPositionY: number;
  wallPositionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  averageRating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedProducts = PaginatedResult<ProductResponse>;

export interface ProductDiscountInput {
  discountType: DiscountType;
  discountValue: number;
  startDate?: Date;
  endDate: Date;
  isActive?: boolean;
}

export type UpdateProductDiscountInput = Partial<ProductDiscountInput>;

export interface ProductDiscountDetailResponse {
  id: string;
  productId: string;
  productName: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE";
  amount: number;
  originalPrice: number;
  finalPrice: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
