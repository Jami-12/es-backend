import multer from "multer";
import type {
  Request,
  RequestHandler,
  Response,
  NextFunction,
} from "express";
import { ApiError } from "../utils/ApiError";
import {
  ensureCloudinaryConfigured,
  uploadImageBuffer,
} from "../config/cloudinary";
import { env } from "../config/env";

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

export const upload = multer({
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
  { name: "file", maxCount: MAX_PRODUCT_IMAGE_FILES },
]);

/**
 * Single-file upload middleware using multer memory storage.
 * Attaches the file buffer to `req.file` with field name "file".
 */
export const singleImageUpload = upload.single("file");

export interface CloudinaryUploadAttachment {
  url: string;
  imageUrl: string;
  publicId: string;
  bytes: number;
  mimeType: string;
}

declare global {
  namespace Express {
    interface Request {
      cloudinaryAttachment?: CloudinaryUploadAttachment;
    }
  }
}

const sanitizeFolderSegment = (value: string): string =>
  value
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");

const resolveCloudinaryFolder = (folder?: string): string => {
  const baseFolder = sanitizeFolderSegment(env.CLOUDINARY_FOLDER || "uploads");

  return [baseFolder, sanitizeFolderSegment(folder ?? "")]
    .filter(Boolean)
    .join("/");
};

const collectSingleUploadedFile = (
  files: Request["files"],
  fieldNames: string[],
): Express.Multer.File | undefined => {
  if (!files) {
    return undefined;
  }

  if (Array.isArray(files)) {
    return files[0];
  }

  for (const fieldName of fieldNames) {
    const file = files[fieldName]?.[0];

    if (file) {
      return file;
    }
  }

  return Object.values(files).flat()[0];
};

export interface EntityImageUploadOptions {
  /** Cloudinary folder suffix, for example "banners", "categories" or "brands". */
  folder: string;
  /** Accepted multipart file field names. Defaults to common image field names. */
  fields?: string[];
  /** Body field that receives the uploaded secure URL. Defaults to "imageUrl". */
  urlField?: string;
  /** Body field that receives the Cloudinary public id. Defaults to "publicId". */
  publicIdField?: string;
}

/**
 * Multer middleware for a single entity image (banner, category, brand...).
 *
 * It accepts the upload via `multipart/form-data`, streams the buffer to
 * Cloudinary and writes the resulting URL (and public id) back into
 * `req.body` so the regular Zod validation and services keep working.
 */
export const entityImageUpload = (
  options: EntityImageUploadOptions,
): RequestHandler => {
  const {
    folder,
    fields = ["image", "file", "banner", "logo"],
    urlField = "imageUrl",
    publicIdField = "publicId",
  } = options;
  const parseMultipart = upload.fields(
    fields.map((name) => ({ name, maxCount: 1 })),
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    parseMultipart(req, res, (parseError: unknown) => {
      if (parseError) {
        next(parseError);
        return;
      }

      const file = collectSingleUploadedFile(req.files, fields);

      if (!file) {
        next();
        return;
      }

      void (async () => {
        ensureCloudinaryConfigured();

        const result = await uploadImageBuffer(
          file.buffer,
          resolveCloudinaryFolder(folder),
        );

        req.cloudinaryAttachment = {
          url: result.imageUrl,
          imageUrl: result.imageUrl,
          publicId: result.publicId,
          bytes: file.size,
          mimeType: file.mimetype,
        };

        if (!req.body || typeof req.body !== "object") {
          req.body = {};
        }

        req.body[urlField] = result.imageUrl;

        if (publicIdField) {
          req.body[publicIdField] = result.publicId;
        }

        next();
      })().catch(next);
    });
  };
};

/**
 * Express middleware that streams `req.file.buffer` to Cloudinary storage
 * and attaches the result to `req.cloudinaryAttachment`.
 */
export const streamToCloudinary = (customFolder?: string) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        return next();
      }

      ensureCloudinaryConfigured();
      const folderParam = (req.body?.folder as string) || customFolder || "general";
      const targetFolder = resolveCloudinaryFolder(folderParam);

      const uploadResult = await uploadImageBuffer(req.file.buffer, targetFolder);
      req.cloudinaryAttachment = {
        url: uploadResult.imageUrl,
        imageUrl: uploadResult.imageUrl,
        publicId: uploadResult.publicId,
        bytes: req.file.size,
        mimeType: req.file.mimetype,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};
