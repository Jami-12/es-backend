import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
} from "@prisma/client";

export interface DailySalesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface MonthlySalesPoint {
  month: string;
  revenue: number;
  orders: number;
}

export interface PaymentMethodBreakdown {
  method: PaymentMethod;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  failedOrders: number;
  revenue: number;
}

export interface OrderStatusBreakdown {
  status: OrderStatus;
  count: number;
}

export interface RecentOrderSummary {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  customerName: string;
  customerEmail: string;
  createdAt: string;
}

export interface LowStockProduct {
  id: string;
  title: string;
  sku: string;
  stock: number;
  status: string;
}

export interface AnalyticsOverview {
  generatedAt: string;
  currency: string;
  revenue: {
    total: number;
    averageOrderValue: number;
  };
  totals: {
    orders: number;
    customers: number;
    admins: number;
    superAdmins: number;
    activeUsers: number;
    inactiveUsers: number;
    products: number;
    activeProducts: number;
    productsWithActiveDiscounts: number;
  };
  dailySales: DailySalesPoint[];
  monthlySales: MonthlySalesPoint[];
  paymentMethodBreakdown: PaymentMethodBreakdown[];
  orderStatusBreakdown: OrderStatusBreakdown[];
  recentOrders: RecentOrderSummary[];
  lowStockProducts: LowStockProduct[];
}

export interface RevenueAnalytics {
  currency: string;
  totalRevenue: number;
  averageOrderValue: number;
  completedPaymentCount: number;
  daily: DailySalesPoint[];
  monthly: MonthlySalesPoint[];
}

export interface PaymentAnalytics {
  currency: string;
  totalRevenue: number;
  totalPayments: number;
  byMethod: PaymentMethodBreakdown[];
  byStatus: { status: PaymentStatus; count: number; amount: number }[];
}

export interface OrderAnalytics {
  totalOrders: number;
  byStatus: OrderStatusBreakdown[];
  daily: { date: string; orders: number }[];
  recentOrders: RecentOrderSummary[];
}

export interface UserRoleCount {
  role: Role;
  count: number;
}
