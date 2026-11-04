import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";
import { ApiError } from "../utils/ApiError";

export const isCloudinaryConfigured = Boolean(
  env.CLOUDINARY_ENABLED &&
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const CLOUDINARY_PRODUCT_FOLDER = `${env.CLOUDINARY_FOLDER}/products`;

export const ensureCloudinaryConfigured = (): void => {
  if (!isCloudinaryConfigured) {
    throw new ApiError(
      503,
      env.CLOUDINARY_ENABLED
        ? "Product image storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
        : "Product image storage is disabled. Set CLOUDINARY_ENABLED=true after configuring valid Cloudinary credentials.",
    );
  }
};

export interface CloudinaryUploadResult {
  imageUrl: string;
  publicId: string;
}

export const uploadImageBuffer = (
  buffer: Buffer,
  folder: string,
): Promise<CloudinaryUploadResult> =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "gif", "avif"],
        use_filename: true,
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(
            ApiError.internal(
              error?.message ?? "Cloudinary did not return an upload result",
            ),
          );
          return;
        }

        resolve({
          imageUrl: result.secure_url || result.url,
          publicId: result.public_id,
        });
      },
    );

    uploadStream.end(buffer);
  });

export const deleteCloudinaryImage = async (publicId: string): Promise<void> => {
  ensureCloudinaryConfigured();

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
  } catch (error) {
    throw ApiError.internal(
      error instanceof Error
        ? `Failed to delete Cloudinary image: ${error.message}`
        : "Failed to delete Cloudinary image",
    );
  }
};

export { cloudinary };
