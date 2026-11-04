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
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptData {
  receiptNumber: string;
  orderNumber: string;
  issuedAt: string;
  store: {
    name: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
  };
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
