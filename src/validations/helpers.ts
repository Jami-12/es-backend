import { z } from "zod";

/**
 * Accepts booleans as well as the string values that `multipart/form-data`
 * sends for checkbox and select fields (`"true"`, `"false"`, `"1"`, `"0"`...).
 */
export const booleanishSchema = z.preprocess((value) => {
  if (value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }

    if (normalized === "") {
      return undefined;
    }
  }

  return value;
}, z.boolean());

export const optionalBooleanishSchema = booleanishSchema.optional();

/** Converts `null` and blank strings to `undefined` so optional fields can be omitted. */
export const emptyToUndefined = (value: unknown): unknown => {
  if (value === null) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

/** Converts blank strings to `undefined` while preserving explicit `null` values. */
export const blankStringToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

/**
 * Optional, nullable text field. Blank strings are accepted and normalised to
 * `null` by the services, while `null`/`undefined` are treated as "not set".
 */
export const nullableTextSchema = (max: number, label = "Value") =>
  z
    .string()
    .trim()
    .max(max, `${label} must contain at most ${max} characters`)
    .nullish();

/**
 * Optional string that must contain between `min` and `max` characters when
 * supplied. Blank strings and `null` become `undefined` so auto-generation can
 * kick in (slugs, SKUs, etc.).
 */
export const optionalTextSchema = (min: number, max: number, label = "Value") =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(min, `${label} must contain at least ${min} characters`)
      .max(max, `${label} must contain at most ${max} characters`)
      .optional(),
  );

/**
 * Wraps a schema so blank strings and `null` are treated as "not provided".
 * Useful for numeric/date fields submitted through `multipart/form-data`.
 */
export const optionalInputSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(blankStringToUndefined, schema.nullable().optional());

const HTTP_URL_PATTERN = /^https?:\/\//i;

/** Accepts absolute http(s) URLs, root-relative paths, anchors and query links. */
export const linkUrlSchema = z
  .string()
  .trim()
  .max(2000, "URL is too long")
  .refine(
    (value) =>
      value === "" ||
      value.startsWith("/") ||
      value.startsWith("#") ||
      value.startsWith("?") ||
      HTTP_URL_PATTERN.test(value),
    "Enter a valid URL or relative path (for example /shop or https://example.com)",
  )
  .nullish();

/** Image sources may be absolute Cloudinary URLs or relative paths. */
export const assetUrlSchema = z
  .string()
  .trim()
  .min(1, "Image URL cannot be empty")
  .max(2000, "URL is too long")
  .refine(
    (value) => value.startsWith("/") || HTTP_URL_PATTERN.test(value),
    "Image URL must be an absolute URL or a relative path",
  );
