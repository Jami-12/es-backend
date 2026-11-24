/**
 * The only sizes an admin can assign to a product. Keeping this list shared by
 * product validation and cart validation prevents arbitrary variants from
 * reaching an order.
 */
export const PRODUCT_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "36",
  "38",
  "40",
  "42",
  "44",
  "Free Size",
] as const;

export type ProductSize = (typeof PRODUCT_SIZES)[number];

export const isProductSize = (value: string): value is ProductSize =>
  (PRODUCT_SIZES as readonly string[]).includes(value);
