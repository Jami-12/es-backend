import { z } from "zod";

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex value")
  .default("#facc15");

export const createNoteSchema = z.object({
  title: z.string().trim().max(120, "Title is too long").nullable().optional(),
  content: z
    .string()
    .trim()
    .min(1, "Note cannot be empty")
    .max(10_000, "Note is too long"),
  color: colorSchema,
});

export const updateNoteSchema = z
  .object({
    title: z.string().trim().max(120, "Title is too long").nullable().optional(),
    content: z
      .string()
      .trim()
      .min(1, "Note cannot be empty")
      .max(10_000, "Note is too long")
      .optional(),
    color: colorSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });
