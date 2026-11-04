import type { ProductStatus } from "@prisma/client";

export interface WishlistProductSummary {
  id: string;
  title: string;
  slug: string;
  image: string | null;
  price: number;
  discountPrice: number | null;
  stock: number;
  status: ProductStatus;
}

export interface WishlistItemResponse {
  id: string;
  productId: string;
  createdAt: string;
  product: WishlistProductSummary;
}
