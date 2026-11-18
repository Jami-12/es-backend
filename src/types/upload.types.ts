export type UploadFolder = "avatar" | "product" | "banner";

export interface UploadImageInput {
  folder?: UploadFolder;
  altText?: string;
}
