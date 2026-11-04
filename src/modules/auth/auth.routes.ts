import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { authRateLimiter } from "../../middlewares/rateLimit.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  changePasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from "../../validations/auth.validation";
import * as authController from "./auth.controller";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  validate({ body: registerSchema }),
  authController.register,
);

router.post(
  "/login",
  authRateLimiter,
  validate({ body: loginSchema }),
  authController.login,
);

router.post(
  "/refresh",
  authRateLimiter,
  validate({ body: refreshTokenSchema }),
  authController.refresh,
);

router.get("/me", authenticate, authController.me);

router.patch(
  "/change-password",
  authenticate,
  authRateLimiter,
  validate({ body: changePasswordSchema }),
  authController.changePassword,
);

router.get("/google", authRateLimiter, authController.googleLogin);

router.get(
  "/google/callback",
  authRateLimiter,
  authController.googleCallback,
);

export const authRoutes = router;
