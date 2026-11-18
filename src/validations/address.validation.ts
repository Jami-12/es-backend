import { z } from "zod";

import { booleanishSchema } from "./helpers";

const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Full name must contain at least 2 characters")
  .max(120);

const phoneSchema = z
  .string()
  .trim()
  .min(6, "Phone number is too short")
  .max(30, "Phone number is too long");

const districtSchema = z
  .string()
  .trim()
  .min(2, "District is required")
  .max(120);

const addressLineSchema = z
  .string()
  .trim()
  .min(5, "Address line must contain at least 5 characters")
  .max(1000);

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish();

export const createAddressSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  division: optionalText(120),
  district: districtSchema,
  area: optionalText(120),
  addressLine: addressLineSchema,
  postalCode: optionalText(20),
  isDefault: booleanishSchema.optional(),
});

export const updateAddressSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    phone: phoneSchema.optional(),
    division: optionalText(120),
    district: districtSchema.optional(),
    area: optionalText(120),
    addressLine: addressLineSchema.optional(),
    postalCode: optionalText(20),
    isDefault: booleanishSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided for update",
  });
