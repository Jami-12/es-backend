import { z } from "zod";

export const uploadFolderSchema = z.enum(["avatar", "product", "banner"]);

export const uploadImageSchema = z.object({
  folder: uploadFolderSchema.default("avatar"),
  altText: z.string().trim().max(255).nullish(),
});
