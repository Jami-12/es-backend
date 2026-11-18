import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { singleImageUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { uploadImageSchema } from "../../validations/upload.validation";
import * as uploadController from "./upload.controller";

const router = Router();

router.post(
  "/image",
  authenticate,
  singleImageUpload,
  validate({ body: uploadImageSchema }),
  uploadController.uploadImage,
);

export const uploadRoutes = router;
