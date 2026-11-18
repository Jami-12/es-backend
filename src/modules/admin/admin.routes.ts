import { Router } from "express";
import { userRoutes } from "../user/user.routes";
import { customerRoutes } from "../user/customer.routes";
import { adminOrderRoutes } from "../order/admin-order.routes";
import { analyticsRoutes } from "../analytics/analytics.routes";
import { auditRoutes } from "../audit/audit.routes";

const router = Router();

router.use("/users", userRoutes);
router.use("/customers", customerRoutes);
router.use("/orders", adminOrderRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/audit-logs", auditRoutes);

export const adminRoutes = router;
