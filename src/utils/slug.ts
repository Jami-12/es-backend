import { randomInt } from "crypto";

const SLUG_SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SKU_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const slugify = (value: string): string => {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};

const randomToken = (length: number, alphabet: string): string => {
  let token = "";

  for (let index = 0; index < length; index += 1) {
    token += alphabet[randomInt(alphabet.length)];
  }

  return token;
};

export const generateSlugSuffix = (length = 4): string =>
  randomToken(length, SLUG_SUFFIX_ALPHABET);

export const generateSku = (prefix = "PRD", length = 8): string =>
  `${prefix.toUpperCase()}-${randomToken(length, SKU_ALPHABET)}`;

/**
 * Returns the base slug when it is available. Otherwise tries readable
 * suffixes (`-2`, `-3`, ...) before falling back to a random short suffix.
 */
export const generateUniqueSlug = async (
  value: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> => {
  const baseSlug = slugify(value) || `product-${generateSlugSuffix(6)}`;

  if (!(await isTaken(baseSlug))) {
    return baseSlug;
  }

  for (let counter = 2; counter <= 20; counter += 1) {
    const candidate = `${baseSlug}-${counter}`;

    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${baseSlug}-${generateSlugSuffix()}`;

    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique slug");
};

export const generateUniqueSku = async (
  isTaken: (sku: string) => Promise<boolean>,
  prefix = "PRD",
): Promise<string> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateSku(prefix);

    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique SKU");
};
