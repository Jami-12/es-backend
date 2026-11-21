import { z } from "zod";

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

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.nullish(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Password is required")
    .max(72, "Password must contain at most 72 characters"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1, "Refresh token is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Current password cannot be empty")
    .max(72, "Password must contain at most 72 characters")
    .optional(),
  newPassword: passwordSchema,
});

const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Verification code must be exactly 6 digits");

export const sendPasswordResetCodeSchema = z.object({
  email: emailSchema,
});

export const verifyPasswordResetCodeSchema = z.object({
  email: emailSchema,
  code: verificationCodeSchema,
});

export const resetPasswordSchema = z
  .object({
    resetToken: z.string().trim().min(1, "Reset token cannot be empty").optional(),
    email: emailSchema.optional(),
    code: verificationCodeSchema.optional(),
    newPassword: passwordSchema,
  })
  .refine(
    (value) => Boolean(value.resetToken) || Boolean(value.email && value.code),
    {
      message: "Provide either a reset token or an email and verification code",
      path: ["resetToken"],
    },
  );
