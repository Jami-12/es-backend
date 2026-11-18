import { Role } from "@prisma/client";

import { env } from "../../config/env";
import {
  ensureCloudinaryConfigured,
  uploadImageBuffer,
} from "../../config/cloudinary";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import type { UploadFolder, UploadImageInput } from "../../types/upload.types";

const FOLDER_SUFFIX: Record<UploadFolder, string> = {
  avatar: "avatars",
  product: "products",
  banner: "banners",
};

const canUploadToFolder = (
  role: Role,
  folder: UploadFolder,
): boolean => {
  if (folder === "avatar") {
    return true;
  }

  return role === Role.ADMIN || role === Role.SUPER_ADMIN;
};

/**
 * POST /api/v1/uploads/image
 *
 * `multer` keeps the file in memory and this handler streams the buffer to
 * Cloudinary. Customers may upload their own avatar; catalogue and banner
 * images are restricted to staff accounts.
 */
export const uploadImage = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const input = req.body as UploadImageInput;
  const folder = input.folder ?? "avatar";

  if (!canUploadToFolder(actor.role, folder)) {
    throw ApiError.forbidden("You do not have permission to upload this image");
  }

  if (!req.file && !req.cloudinaryAttachment) {
    throw ApiError.badRequest(
      'Select an image and send it as the multipart field named "file"',
    );
  }

  let imageUrl: string;
  let publicId: string;

  if (req.cloudinaryAttachment) {
    imageUrl = req.cloudinaryAttachment.imageUrl;
    publicId = req.cloudinaryAttachment.publicId;
  } else {
    ensureCloudinaryConfigured();

    const baseFolder = env.CLOUDINARY_FOLDER.replace(/^\/+|\/+$/g, "");
    const upload = await uploadImageBuffer(
      req.file!.buffer,
      `${baseFolder}/${FOLDER_SUFFIX[folder]}`,
    );
    imageUrl = upload.imageUrl;
    publicId = upload.publicId;
  }

  sendSuccess(res, {
    statusCode: 201,
    data: {
      image: {
        url: imageUrl,
        imageUrl,
        publicId,
        width: null,
        height: null,
        bytes: req.file?.size ?? req.cloudinaryAttachment?.bytes ?? 0,
        mimeType: req.file?.mimetype ?? req.cloudinaryAttachment?.mimeType ?? "image/jpeg",
      },
      folder,
    },
    message: "Image uploaded successfully",
  });
});
