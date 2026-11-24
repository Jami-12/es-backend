export interface HomeCategorySectionResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  categoryImage: string | null;
  isVisible: boolean;
  sortOrder: number;
}

import type { DiscountType } from "@prisma/client";

export interface SettingsResponse {
  id: string;
  siteName: string;
  navbarLogoUrl: string | null;
  navbarLogoPublicId: string | null;
  showHero: boolean;
  showProductFinder: boolean;
  showMiddleCategories: boolean;
  showCategorySections: boolean;
  showNewArrivals: boolean;
  showBrands: boolean;
  showPromoBanners: boolean;
  showNewsletter: boolean;
  /** Payment methods enabled from the dashboard. */
  codEnabled: boolean;
  bkashEnabled: boolean;
  nagadEnabled: boolean;
  stripeEnabled: boolean;
  /** Shipping is a separate line item; disabled means free shipping (fee = 0). */
  shippingEnabled: boolean;
  shippingFee: number;
  freeShippingThreshold: number;
  /** Automatic store-wide discount applied to eligible product subtotals. */
  flatDiscountEnabled: boolean;
  flatDiscountType: DiscountType | null;
  flatDiscountValue: number;
  flatDiscountMinAmount: number | null;
  categorySections: HomeCategorySectionResponse[];
  /** Convenience list of category ids whose home section is currently visible. */
  visibleCategoryIds: string[];
  updatedAt: string;
}

export interface HomeCategorySectionInput {
  categoryId: string;
  isVisible?: boolean;
  sortOrder?: number;
}

export interface UpdateSettingsInput {
  siteName?: string | null;
  navbarLogoUrl?: string | null;
  navbarLogoPublicId?: string | null;
  showHero?: boolean;
  showProductFinder?: boolean;
  showMiddleCategories?: boolean;
  showCategorySections?: boolean;
  showNewArrivals?: boolean;
  showBrands?: boolean;
  showPromoBanners?: boolean;
  showNewsletter?: boolean;
  codEnabled?: boolean;
  bkashEnabled?: boolean;
  nagadEnabled?: boolean;
  stripeEnabled?: boolean;
  shippingEnabled?: boolean;
  shippingFee?: number;
  freeShippingThreshold?: number;
  flatDiscountEnabled?: boolean;
  flatDiscountType?: DiscountType | null;
  flatDiscountValue?: number;
  flatDiscountMinAmount?: number | null;
  categorySections?: HomeCategorySectionInput[];
}

export interface VerifyDataResetCodeInput {
  code: string;
}

export interface ExecuteDataResetInput {
  verificationToken: string;
  confirmation: string;
}

export interface DataResetVerification {
  verificationToken: string;
  expiresIn: string;
}

/** Number of rows removed by a completed wipe, grouped by domain. */
export interface DataResetSummary {
  products: number;
  categories: number;
  brands: number;
  banners: number;
  coupons: number;
  orders: number;
  payments: number;
  reviews: number;
  carts: number;
  wishlists: number;
  notifications: number;
  addresses: number;
  financeRecords: number;
  employees: number;
  inventoryLogs: number;
  totalRecords: number;
}
