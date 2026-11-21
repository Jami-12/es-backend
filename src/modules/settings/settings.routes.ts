import { Role } from "@prisma/client";
import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { authRateLimiter } from "../../middlewares/rateLimit.middleware";
import { entityImageUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  executeDataResetSchema,
  updateSettingsSchema,
  verifyDataResetCodeSchema,
} from "../../validations/settings.validation";
import { updateReceiptSettingsSchema as receiptSettingsSchema } from "../../validations/receipt-settings.validation";
import * as receiptSettingsController from "./receipt-settings.controller";
import * as settingsController from "./settings.controller";

const router = Router();

// Public: the storefront and printable receipts need branding before login.
router.get("/", settingsController.getSettings);
router.get("/receipt", receiptSettingsController.getReceiptSettings);

// Shop admins may customise receipts; the remaining store settings stay super-admin only.
router.patch(
  "/receipt",
  authenticate,
  authorize([Role.SUPER_ADMIN, Role.ADMIN]),
  validate({ body: receiptSettingsSchema }),
  receiptSettingsController.updateReceiptSettings,
);

router.use(authenticate, authorize([Role.SUPER_ADMIN]));

const navbarLogoUpload = entityImageUpload({
  folder: "settings",
  fields: ["logo", "navbarLogo", "image", "file"],
  urlField: "navbarLogoUrl",
  publicIdField: "navbarLogoPublicId",
});

router.patch(
  "/",
  navbarLogoUpload,
  validate({ body: updateSettingsSchema }),
  settingsController.updateSettings,
);

// Danger zone: every step requires a SUPER_ADMIN JWT plus an email code sent
// to that admin's current account email. The service re-checks the account.
router.post(
  "/data-reset/request-code",
  authRateLimiter,
  settingsController.requestDataResetCode,
);

router.post(
  "/data-reset/verify-code",
  authRateLimiter,
  validate({ body: verifyDataResetCodeSchema }),
  settingsController.verifyDataResetCode,
);

router.post(
  "/data-reset/execute",
  authRateLimiter,
  validate({ body: executeDataResetSchema }),
  settingsController.executeDataReset,
);

export const settingsRoutes = router;
