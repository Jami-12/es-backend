import multer from "multer";
import { ApiError } from "../utils/ApiError";

export const MAX_PRODUCT_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_FILES = 10;
export const MAX_PRODUCT_IMAGES_PER_PRODUCT = 20;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_SIZE_BYTES,
    files: MAX_PRODUCT_IMAGE_FILES,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(
        ApiError.badRequest(
          `Unsupported image type "${file.mimetype}". Allowed types: JPEG, PNG, WebP, GIF and AVIF.`,
        ),
      );
      return;
    }

    callback(null, true);
  },
});

export const productImageUpload = upload.fields([
  { name: "images", maxCount: MAX_PRODUCT_IMAGE_FILES },
  { name: "image", maxCount: 1 },
]);
