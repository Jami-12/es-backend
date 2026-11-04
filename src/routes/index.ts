import { Router } from "express";
import { env } from "../config/env";
import { sendSuccess } from "../utils/ApiResponse";
import { authRoutes } from "../modules/auth/auth.routes";
import { userRoutes } from "../modules/user/user.routes";
import { categoryRoutes } from "../modules/category/category.routes";
import { brandRoutes } from "../modules/brand/brand.routes";
import { productRoutes } from "../modules/product/product.routes";
import { productImageRoutes } from "../modules/product/product-image.routes";
import { productDiscountRoutes } from "../modules/product-discount/product-discount.routes";
import { cartRoutes } from "../modules/cart/cart.routes";
import { wishlistRoutes } from "../modules/wishlist/wishlist.routes";
import { addressRoutes } from "../modules/address/address.routes";
import { orderRoutes } from "../modules/order/order.routes";
import { paymentRoutes } from "../modules/payment/payment.routes";
import { couponRoutes } from "../modules/coupon/coupon.routes";
import {
  productReviewRoutes,
  reviewRoutes,
} from "../modules/review/review.routes";
import { notificationRoutes } from "../modules/notification/notification.routes";
import { adminRoutes } from "../modules/admin/admin.routes";
import { analyticsRoutes } from "../modules/analytics/analytics.routes";
import { auditRoutes } from "../modules/audit/audit.routes";
import { expenseRoutes } from "../modules/expense/expense.routes";
import { investmentRoutes } from "../modules/investment/investment.routes";
import { employeeRoutes } from "../modules/employee/employee.routes";
import { salaryRoutes } from "../modules/salary/salary.routes";
import { inventoryRoutes } from "../modules/inventory/inventory.routes";
import { accountingRoutes } from "../modules/accounting/accounting.routes";

const router = Router();

router.get("/", (_req, res) => {
  sendSuccess(res, {
    data: {
      name: "3D E-Commerce API",
      version: "1.0.0",
      environment: env.NODE_ENV,
      endpoints: {
        auth: "/api/v1/auth",
        users: "/api/v1/users",
        categories: "/api/v1/categories",
        brands: "/api/v1/brands",
        products: "/api/v1/products",
        productImages: "/api/v1/products/:productId/images",
        cart: "/api/v1/cart",
        wishlist: "/api/v1/wishlist",
        addresses: "/api/v1/addresses",
        orders: "/api/v1/orders",
        payments: "/api/v1/payments",
        coupons: "/api/v1/coupons",
        reviews: "/api/v1/reviews",
        notifications: "/api/v1/notifications",
        admin: "/api/v1/admin",
        analytics: "/api/v1/analytics",
        audit: "/api/v1/audit",
        expenses: "/api/v1/expenses",
        investments: "/api/v1/investments",
        employees: "/api/v1/employees",
        salaries: "/api/v1/salaries",
        inventory: "/api/v1/inventory",
        accounting: "/api/v1/accounting",
      },
    },
    message: "3D E-Commerce API is running",
  });
});

router.get("/health", (_req, res) => {
  sendSuccess(res, {
    data: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    message: "Service is healthy",
  });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/categories", categoryRoutes);
router.use("/brands", brandRoutes);
router.use("/products/:productId/images", productImageRoutes);
router.use("/products/:productId/reviews", productReviewRoutes);
router.use("/products/:productId/discount", productDiscountRoutes);
router.use("/products", productRoutes);
router.use("/cart", cartRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/addresses", addressRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/coupons", couponRoutes);
router.use("/reviews", reviewRoutes);
router.use("/notifications", notificationRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/audit", auditRoutes);
router.use("/expenses", expenseRoutes);
router.use("/investments", investmentRoutes);
router.use("/employees", employeeRoutes);
router.use("/salaries", salaryRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/accounting", accountingRoutes);
router.use("/admin", adminRoutes);

export const apiRouter = router;
