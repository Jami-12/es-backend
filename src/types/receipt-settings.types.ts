export interface ReceiptSettingsResponse {
  id: string;
  storeName: string;
  tagline: string | null;
  logoUrl: string | null;
  footerNote: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  showLogo: boolean;
  showSize: boolean;
  showColor: boolean;
  showPaymentMethod: boolean;
  showTransactionId: boolean;
  showCustomer: boolean;
  showShippingAddress: boolean;
  updatedAt: string;
}

export interface UpdateReceiptSettingsInput {
  storeName?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
  footerNote?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
  showLogo?: boolean;
  showSize?: boolean;
  showColor?: boolean;
  showPaymentMethod?: boolean;
  showTransactionId?: boolean;
  showCustomer?: boolean;
  showShippingAddress?: boolean;
}
