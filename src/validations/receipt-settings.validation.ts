import { z } from "zod";

import {
  assetUrlSchema,
  booleanishSchema,
  emptyToUndefined,
  nullableTextSchema,
} from "./helpers";

/** Empty strings mean "no logo"; the literal string "null" clears it. */
const nullableLogoUrlSchema = z.preprocess((value) => {
  if (value === null || value === "null") {
    return null;
  }

  return emptyToUndefined(value);
}, assetUrlSchema.nullable().optional());

export const updateReceiptSettingsSchema = z
  .object({
    storeName: nullableTextSchema(160, "Store name"),
    tagline: nullableTextSchema(240, "Tagline"),
    logoUrl: nullableLogoUrlSchema,
    footerNote: nullableTextSchema(2000, "Footer note"),
    contactPhone: nullableTextSchema(80, "Contact phone"),
    contactEmail: nullableTextSchema(160, "Contact email"),
    contactAddress: nullableTextSchema(500, "Contact address"),
    showLogo: booleanishSchema.optional(),
    showSize: booleanishSchema.optional(),
    showColor: booleanishSchema.optional(),
    showPaymentMethod: booleanishSchema.optional(),
    showTransactionId: booleanishSchema.optional(),
    showCustomer: booleanishSchema.optional(),
    showShippingAddress: booleanishSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one receipt setting must be provided for update",
  });
