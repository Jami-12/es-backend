import { Role, UserStatus } from "@prisma/client";
import { z } from "zod";

import { booleanishSchema } from "./helpers";

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must contain at least 2 characters")
  .max(120, "Name must contain at most 120 characters");

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(255, "Email must contain at most 255 characters")
  .email("Please provide a valid email address")
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .max(72, "Password must contain at most 72 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/\d/, "Password must contain at least one number");

const phoneSchema = z
  .string()
  .trim()
  .min(6, "Phone number is too short")
  .max(30, "Phone number is too long");

const imageSchema = z
  .string()
  .trim()
  .min(1, "Profile image URL cannot be empty")
  .max(2000, "Profile image URL is too long")
  .nullable();

const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const createAdminSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.nullish(),
});

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    image: imageSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateSelfProfileSchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    image: imageSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

export const updateUserStatusSchema = z
  .object({
    status: z.nativeEnum(UserStatus).optional(),
    isActive: booleanishSchema.optional(),
  })
  .refine((value) => value.status !== undefined || value.isActive !== undefined, {
    message: "Provide status or isActive",
  });

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  isActive: booleanQuerySchema.optional(),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().max(255).optional(),
  search: z.string().trim().max(200).optional(),
  includeDeleted: booleanQuerySchema.default(false),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().trim().max(200).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
