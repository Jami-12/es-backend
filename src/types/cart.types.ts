import type { ProductStatus } from "@prisma/client";
import type { ProductDiscountResponse } from "./product.types";

export interface AddCartItemInput {
  productId: string;
  quantity: number;
  /** Empty string means the product has no size/colour selection. */
  selectedSize?: string;
  selectedColor?: string;
}

export interface UpdateCartItemInput {
  quantity: number;
}

export interface CartProductSummary {
  id: string;
  title: string;
  slug: string;
  image: string | null;
  price: number;
  originalPrice: number;
  sellingPrice: number;
  finalPrice: number;
  discount: ProductDiscountResponse | null;
  stock: number;
  status: ProductStatus;
}

export interface CartItemResponse {
  id: string;
  productId: string;
  selectedSize: string | null;
  selectedColor: string | null;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  discountAmount: number;
  finalUnitPrice: number;
  lineTotal: number;
  product: CartProductSummary;
}

export interface CartResponse {
  id: string;
  userId: string;
  items: CartItemResponse[];
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  createdAt: string;
  updatedAt: string;
}
