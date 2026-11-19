import { Role } from "@prisma/client";
import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { entityImageUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { updateSettingsSchema } from "../../validations/settings.validation";
import * as settingsController from "./settings.controller";

const router = Router();

// Public: the storefront needs the navbar logo and section visibility before login.
router.get("/", settingsController.getSettings);

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

export const settingsRoutes = router;
