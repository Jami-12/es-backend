import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import type { PaginatedResult } from "./common.types";

export interface CheckoutInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  notes?: string;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
}

export interface CollectCodPaymentInput {
  note?: string;
  reference?: string;
}

/** Collection state derived from the order + its payment. */
export type CashCollectionStatus = "PENDING" | "COLLECTED" | "CANCELLED";

export interface CashCollectionListQuery {
  page: number;
  limit: number;
  status?: CashCollectionStatus;
  search?: string;
}

/**
 * Flat, table-free projection consumed by the admin Cash Collection cards.
 * Every order (any payment method) is a cash-collection entry.
 */
export interface CashCollectionItem {
  orderId: string;
  orderNumber: string;
  customerName: string;
  /** SKU / product code (falls back to product or line-item id). */
  productNumber: string;
  itemCount: number;
  status: CashCollectionStatus;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  orderStatus: OrderStatus;
  transactionId: string | null;
  collectedAt: string | null;
  collectedByName: string | null;
  createdAt: string;
}

export interface CashCollectionSummary {
  pendingCount: number;
  collectedCount: number;
  cancelledCount: number;
  pendingAmount: number;
  collectedAmount: number;
}

export interface PaginatedCashCollections {
  items: CashCollectionItem[];
  meta: PaginatedResult<CashCollectionItem>["meta"];
  summary: CashCollectionSummary;
}

export interface OrderListQuery {
  page: number;
  limit: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  userId?: string;
  search?: string;
  sortOrder: "asc" | "desc";
}

export interface OrderCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface OrderAddress {
  id: string;
  fullName: string;
  phone: string;
  division: string | null;
  district: string;
  area: string | null;
  addressLine: string;
  postalCode: string | null;
}

export interface OrderItemResponse {
  id: string;
  productId: string | null;
  productName: string;
  productImage: string | null;
  sku: string | null;
  /** Nullable for historical orders placed before variants were stored. */
  size: string | null;
  color: string | null;
  unitPrice: number;
  originalPrice: number;
  discountAmount: number;
  finalUnitPrice: number;
  purchasePrice: number;
  quantity: number;
  totalPrice: number;
  subtotal: number;
  productCost: number;
  createdAt: string;
}

export interface PaymentSummary {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  transactionId: string | null;
  providerReference: string | null;
  paidAt: string | null;
  collectedById: string | null;
  collectedByName: string | null;
  collectedAt: string | null;
  collectionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderCouponSummary {
  id: string;
  code: string;
  discountPercent: number | null;
  discountAmount: number | null;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  addressId: string | null;
  subtotal: number;
  discountAmount: number;
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
  totalProductCost: number;
  grossProfit: number;
  netProfit: number;
  refundedAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  receiptNumber: string | null;
  receiptUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: OrderCustomer;
  address: OrderAddress | null;
  items: OrderItemResponse[];
  payment: PaymentSummary | null;
  coupon: OrderCouponSummary | null;
}

export interface ReceiptItem {
  productName: string;
  productImage: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptDisplayOptions {
  showLogo: boolean;
  showSize: boolean;
  showColor: boolean;
  showPaymentMethod: boolean;
  showTransactionId: boolean;
  showCustomer: boolean;
  showShippingAddress: boolean;
}

export interface ReceiptData {
  receiptNumber: string;
  orderNumber: string;
  issuedAt: string;
  store: {
    name: string;
    tagline: string | null;
    logoUrl: string | null;
    footerNote: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
  };
  display: ReceiptDisplayOptions;
  customer: OrderCustomer;
  shippingAddress: OrderAddress | null;
  items: ReceiptItem[];
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    transactionId: string | null;
    paidAt: string | null;
  } | null;
  totals: {
    subtotal: number;
    discountAmount: number;
    shippingCost: number;
    totalAmount: number;
    currency: string;
  };
}

export type PaginatedOrders = PaginatedResult<OrderResponse>;

export interface OrderTrackingEvent {
  label: string;
  description: string;
  completed: boolean;
  current: boolean;
  timestamp: string | null;
}

export interface OrderTrackingItem {
  productName: string;
  productImage: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  totalPrice: number;
}

export interface OrderTrackingResult {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  placedAt: string;
  updatedAt: string;
  itemCount: number;
  totalAmount: number;
  items: OrderTrackingItem[];
  timeline: OrderTrackingEvent[];
}

export interface OrderTrackingQuery {
  code: string;
}
