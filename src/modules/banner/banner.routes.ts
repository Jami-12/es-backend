import { Role } from "@prisma/client";
import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { entityImageUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validations/common.validation";
import {
  bannerListQuerySchema,
  createBannerSchema,
  updateBannerSchema,
  updateBannerStatusSchema,
} from "../../validations/banner.validation";
import * as bannerController from "./banner.controller";

const router = Router();

router.get(
  "/",
  validate({ query: bannerListQuerySchema }),
  bannerController.listPublicBanners,
);

router.use(authenticate, authorize([Role.SUPER_ADMIN, Role.ADMIN]));

router.get(
  "/admin",
  validate({ query: bannerListQuerySchema }),
  bannerController.listBanners,
);

router.get(
  "/admin/:id",
  validate({ params: idParamSchema }),
  bannerController.getBanner,
);

router.post(
  "/admin",
  entityImageUpload({
    folder: "banners",
    fields: ["image", "file", "banner"],
    urlField: "imageUrl",
    publicIdField: "publicId",
  }),
  validate({ body: createBannerSchema }),
  bannerController.createBanner,
);

router.patch(
  "/admin/:id/status",
  validate({ params: idParamSchema, body: updateBannerStatusSchema }),
  bannerController.updateBannerStatus,
);

router.patch(
  "/:id/status",
  validate({ params: idParamSchema, body: updateBannerStatusSchema }),
  bannerController.updateBannerStatus,
);

router.patch(
  "/admin/:id",
  entityImageUpload({
    folder: "banners",
    fields: ["image", "file", "banner"],
    urlField: "imageUrl",
    publicIdField: "publicId",
  }),
  validate({ params: idParamSchema, body: updateBannerSchema }),
  bannerController.updateBanner,
);

router.delete(
  "/admin/:id",
  validate({ params: idParamSchema }),
  bannerController.removeBanner,
);

export const bannerRoutes = router;
