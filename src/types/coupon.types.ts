export interface CreateCouponInput {
  code: string;
  description?: string | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  minimumAmount?: number | null;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdateCouponInput {
  code?: string;
  description?: string | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  minimumAmount?: number | null;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdateCouponStatusInput {
  isActive: boolean;
}

export interface CouponListQuery {
  search?: string;
  isActive?: boolean;
}

export interface CouponResponse {
  id: string;
  code: string;
  description: string | null;
  discountPercent: number | null;
  discountAmount: number | null;
  minimumAmount: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidateCouponInput {
  code: string;
  subtotal?: number;
}

export interface CouponValidationResult {
  coupon: CouponResponse;
  subtotal: number;
  discountAmount: number;
  totalAfterDiscount: number;
}
