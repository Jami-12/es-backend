export interface HomeCategorySectionResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  categoryImage: string | null;
  isVisible: boolean;
  sortOrder: number;
}

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
  categorySections?: HomeCategorySectionInput[];
}
