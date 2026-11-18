import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().trim().url("Must be a valid absolute URL").optional(),
);

const requiredUrl = z.string().trim().url("Must be a valid absolute URL");

const jwtExpiry = z
  .string()
  .trim()
  .regex(
    /^\d+(ms|s|m|h|d|w|y)$/i,
    "Must be a duration such as 15m, 7d or 30d",
  );

const databaseUrlSchema = z
  .string()
  .trim()
  .min(1, "DATABASE_URL is required")
  .superRefine((value, ctx) => {
    if (/\\[nrtbfv"'\\]/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "DATABASE_URL contains an invalid escape sequence. Use a plain PostgreSQL URL.",
      });
    }

    let parsed: URL;

    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL is not a valid URL",
      });
      return;
    }

    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL must use the postgresql:// scheme",
      });
    }

    if (!parsed.username || !parsed.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL must include a database username and password",
      });
    }

    if (!parsed.hostname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL must include a database host",
      });
    }

    if (!parsed.pathname || parsed.pathname === "/") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DATABASE_URL must include a database name",
      });
    }
  });

const corsOriginSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    if (value === "*") {
      return true;
    }

    return value.split(",").every((origin) => {
      const trimmed = origin.trim();

      if (!trimmed) {
        return false;
      }

      try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    });
  }, "CORS_ORIGIN must be * or a comma-separated list of http(s) URLs");

const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Must be a three-letter ISO currency code")
  .transform((value) => value.toUpperCase());

// Optional currency overrides are commonly left blank in .env files. Treat an
// empty value as "not configured" so it falls back to STORE_CURRENCY instead
// of failing startup validation.
const optionalCurrencySchema = z.preprocess(
  emptyToUndefined,
  currencySchema.optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    DATABASE_URL: databaseUrlSchema,

    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),
    JWT_ACCESS_EXPIRES_IN: jwtExpiry.default("7d"),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, "JWT_REFRESH_SECRET must contain at least 32 characters"),
    JWT_REFRESH_EXPIRES_IN: jwtExpiry.default("30d"),

    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    FRONTEND_URL: requiredUrl.default("http://localhost:3000"),
    CLIENT_URL: optionalUrl,
    CORS_ORIGIN: z.preprocess(
      emptyToUndefined,
      corsOriginSchema.optional(),
    ),
    PUBLIC_BASE_URL: optionalUrl,
    TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

    STORE_NAME: z.string().trim().min(1).default("3D Commerce"),
    STORE_ADDRESS: z.string().trim().min(1).default("Dhaka, Bangladesh"),
    STORE_PHONE: z.string().trim().min(1).default("+8801000000000"),
    STORE_EMAIL: z.string().trim().email().default("support@example.com"),
    STORE_CURRENCY: currencySchema.default("BDT"),

    SHIPPING_FLAT_RATE: z.coerce.number().min(0).default(60),
    FREE_SHIPPING_THRESHOLD: z.coerce.number().min(0).default(1000),
    LOW_STOCK_THRESHOLD: z.coerce.number().int().min(1).default(5),
    PAYMENT_WEBHOOK_SECRET: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .min(
          32,
          "PAYMENT_WEBHOOK_SECRET must contain at least 32 characters",
        )
        .optional(),
    ),

    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    GOOGLE_CALLBACK_URL: requiredUrl.default(
      "http://localhost:4000/api/v1/auth/google/callback",
    ),
    GOOGLE_SUCCESS_REDIRECT_URL: optionalUrl,

    BKASH_ENABLED: booleanFromEnv.default(false),
    BKASH_BASE_URL: optionalUrl,
    BKASH_APP_KEY: optionalString,
    BKASH_APP_SECRET: optionalString,
    BKASH_USERNAME: optionalString,
    BKASH_PASSWORD: optionalString,
    BKASH_CALLBACK_URL: optionalUrl,

    NAGAD_ENABLED: booleanFromEnv.default(false),
    NAGAD_SIMULATION: booleanFromEnv.default(false),
    NAGAD_BASE_URL: optionalUrl,
    NAGAD_MERCHANT_ID: optionalString,
    NAGAD_MERCHANT_NUMBER: optionalString,
    NAGAD_PRIVATE_KEY: optionalString,
    NAGAD_PUBLIC_KEY: optionalString,
    NAGAD_CALLBACK_URL: optionalUrl,

    STRIPE_ENABLED: booleanFromEnv.optional(),
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_PUBLISHABLE_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_CURRENCY: optionalCurrencySchema,

    CARD_PROVIDER: optionalString,
    CARD_SECRET_KEY: optionalString,
    CARD_PUBLISHABLE_KEY: optionalString,
    CARD_WEBHOOK_SECRET: optionalString,
    CARD_CURRENCY: optionalCurrencySchema,

    CLOUDINARY_ENABLED: booleanFromEnv.default(false),
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    CLOUDINARY_FOLDER: z
      .string()
      .trim()
      .min(1)
      .default("ecommerce-products"),

    SUPER_ADMIN_NAME: z.string().trim().min(2).default("Super Admin"),
    SUPER_ADMIN_EMAIL: z
      .string()
      .trim()
      .email()
      .default("admin@example.com"),
    SUPER_ADMIN_PASSWORD: z
      .string()
      .min(12, "SUPER_ADMIN_PASSWORD must contain at least 12 characters")
      .refine(
        (value) =>
          !/^(changeme|change_this|password|admin|secret)/i.test(value.trim()),
        "SUPER_ADMIN_PASSWORD must not be a default or placeholder password",
      ),
    SEED_RESET_SUPER_ADMIN_PASSWORD: booleanFromEnv.default(false),
  })
  .superRefine((value, ctx) => {
    const requireWhenEnabled = (
      enabled: boolean,
      provider: string,
      fields: Array<[string, string | undefined]>,
    ): void => {
      if (!enabled) {
        return;
      }

      for (const [name, fieldValue] of fields) {
        if (!fieldValue) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: `${name} is required when ${provider} is enabled`,
          });
        }
      }
    };

    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message: "JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET",
      });
    }

    if (
      Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_CLIENT_SECRET"],
        message:
          "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together",
      });
    }

    requireWhenEnabled(value.BKASH_ENABLED, "bKash", [
      ["BKASH_BASE_URL", value.BKASH_BASE_URL],
      ["BKASH_APP_KEY", value.BKASH_APP_KEY],
      ["BKASH_APP_SECRET", value.BKASH_APP_SECRET],
      ["BKASH_USERNAME", value.BKASH_USERNAME],
      ["BKASH_PASSWORD", value.BKASH_PASSWORD],
      ["BKASH_CALLBACK_URL", value.BKASH_CALLBACK_URL],
    ]);

    const nagadSimulation =
      value.NAGAD_ENABLED &&
      value.NAGAD_SIMULATION &&
      value.NODE_ENV !== "production";

    requireWhenEnabled(value.NAGAD_ENABLED && !nagadSimulation, "Nagad", [
      ["NAGAD_BASE_URL", value.NAGAD_BASE_URL],
      ["NAGAD_MERCHANT_ID", value.NAGAD_MERCHANT_ID],
      ["NAGAD_MERCHANT_NUMBER", value.NAGAD_MERCHANT_NUMBER],
      ["NAGAD_PRIVATE_KEY", value.NAGAD_PRIVATE_KEY],
      ["NAGAD_PUBLIC_KEY", value.NAGAD_PUBLIC_KEY],
      ["NAGAD_CALLBACK_URL", value.NAGAD_CALLBACK_URL],
    ]);

    const stripeEnabled =
      value.STRIPE_ENABLED ??
      (value.CARD_PROVIDER?.toLowerCase() === "stripe" &&
        Boolean(value.STRIPE_SECRET_KEY ?? value.CARD_SECRET_KEY));

    requireWhenEnabled(stripeEnabled, "Stripe", [
      [
        "STRIPE_SECRET_KEY",
        value.STRIPE_SECRET_KEY ?? value.CARD_SECRET_KEY,
      ],
      [
        "STRIPE_WEBHOOK_SECRET",
        value.STRIPE_WEBHOOK_SECRET ?? value.CARD_WEBHOOK_SECRET,
      ],
    ]);

    requireWhenEnabled(value.CLOUDINARY_ENABLED, "Cloudinary", [
      ["CLOUDINARY_CLOUD_NAME", value.CLOUDINARY_CLOUD_NAME],
      ["CLOUDINARY_API_KEY", value.CLOUDINARY_API_KEY],
      ["CLOUDINARY_API_SECRET", value.CLOUDINARY_API_SECRET],
    ]);

    if (
      (value.BKASH_ENABLED || value.NAGAD_ENABLED) &&
      value.STORE_CURRENCY !== "BDT"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORE_CURRENCY"],
        message:
          "STORE_CURRENCY must be BDT while bKash or Nagad is enabled; both providers are integrated for BDT only",
      });
    }

    const configuredStripeCurrency =
      value.STRIPE_CURRENCY ?? value.CARD_CURRENCY;

    if (
      stripeEnabled &&
      configuredStripeCurrency &&
      configuredStripeCurrency !== value.STORE_CURRENCY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_CURRENCY"],
        message:
          "STRIPE_CURRENCY must match STORE_CURRENCY so the charged amount matches the order total",
      });
    }

    if (value.BKASH_ENABLED && value.BKASH_BASE_URL) {
      try {
        const host = new URL(value.BKASH_BASE_URL).hostname.toLowerCase();
        const sandboxHosts = new Set([
          "tokenized.sandbox.bka.sh",
          "sandbox.bka.sh",
        ]);

        if (value.NODE_ENV !== "production" && !sandboxHosts.has(host)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["BKASH_BASE_URL"],
            message:
              "BKASH_BASE_URL must use the official bKash Tokenized Checkout sandbox host (https://tokenized.sandbox.bka.sh/v1.2.0-beta) outside production",
          });
        }
      } catch {
        // optionalUrl already reports malformed URLs.
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "ENV"}: ${issue.message}`)
    .join("\n");

  console.error(`Invalid environment configuration:\n${formatted}`);
  process.exit(1);
}

const rawEnv = parsed.data;
const stripeSecretKey =
  rawEnv.STRIPE_SECRET_KEY ?? rawEnv.CARD_SECRET_KEY;
const stripeWebhookSecret =
  rawEnv.STRIPE_WEBHOOK_SECRET ?? rawEnv.CARD_WEBHOOK_SECRET;
const stripePublishableKey =
  rawEnv.STRIPE_PUBLISHABLE_KEY ?? rawEnv.CARD_PUBLISHABLE_KEY;
const stripeEnabled =
  rawEnv.STRIPE_ENABLED ??
  (rawEnv.CARD_PROVIDER?.toLowerCase() === "stripe" &&
    Boolean(stripeSecretKey));

export const env = {
  ...rawEnv,
  STRIPE_ENABLED: stripeEnabled,
  STRIPE_SECRET_KEY: stripeSecretKey,
  STRIPE_PUBLISHABLE_KEY: stripePublishableKey,
  STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
  STRIPE_CURRENCY: rawEnv.STRIPE_CURRENCY ?? rawEnv.CARD_CURRENCY ?? "BDT",
  CLIENT_URL: rawEnv.CLIENT_URL ?? rawEnv.FRONTEND_URL,
  CORS_ORIGIN: rawEnv.CORS_ORIGIN ?? rawEnv.FRONTEND_URL,
  PUBLIC_BASE_URL:
    rawEnv.PUBLIC_BASE_URL ?? `http://localhost:${rawEnv.PORT}`,
  isProduction: rawEnv.NODE_ENV === "production",
  isDevelopment: rawEnv.NODE_ENV === "development",
  isTest: rawEnv.NODE_ENV === "test",
} as const;

export type AppEnv = typeof env;

if (env.STRIPE_ENABLED && !env.STRIPE_PUBLISHABLE_KEY) {
  console.warn(
    "[payment-config] STRIPE_ENABLED is true but STRIPE_PUBLISHABLE_KEY is missing. The storefront cannot initialise Stripe Elements without a publishable key.",
  );
}

if (env.NAGAD_ENABLED && env.NAGAD_BASE_URL) {
  try {
    const nagadUrl = new URL(env.NAGAD_BASE_URL);

    if (
      nagadUrl.hostname.toLowerCase() === "sandbox.mynagad.com" &&
      nagadUrl.protocol === "https:"
    ) {
      console.warn(
        "[payment-config] The classic Nagad sandbox endpoint uses http://sandbox.mynagad.com:10080. Verify NAGAD_BASE_URL against the endpoint issued in your merchant documentation.",
      );
    }
  } catch {
    // optionalUrl already validates malformed URLs.
  }
}
