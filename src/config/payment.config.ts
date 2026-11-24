import { env } from "./env";
import {
  getBkashCallbackConfigError,
  getNagadCallbackUrl,
  resolveBkashCallbackUrl,
} from "./origins";

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const cleanBaseUrl = (
  value: string | undefined,
  endpointSuffixes: string[],
): string | undefined => {
  const trimmed = clean(value);

  if (!trimmed) {
    return undefined;
  }

  let normalized = trimmed.replace(/\/+$/, "");

  // Accept a full endpoint pasted by mistake and reduce it to the base path
  // that the provider client appends its endpoint segments to.
  for (const suffix of endpointSuffixes) {
    if (normalized.toLowerCase().endsWith(suffix.toLowerCase())) {
      normalized = normalized
        .slice(0, normalized.length - suffix.length)
        .replace(/\/+$/, "");
      break;
    }
  }

  return normalized || undefined;
};

const sandboxBkashBaseUrl = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
const sandboxNagadBaseUrl =
  "http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs";

// Startup log only. Per-request callback values are resolved lazily by
// origins.ts so Vercel deployments can use their active HTTPS origin.
const startupBkashCallback = resolveBkashCallbackUrl();
console.info(
  `[config] bKash merchant callback (env/default): ${startupBkashCallback.url ?? startupBkashCallback.error ?? "unresolved"}`,
);

/** Startup-time validation error, kept for providers that fail fast locally. */
export const bkashCallbackConfigError = getBkashCallbackConfigError();

export const bkashConfig = {
  enabled: env.BKASH_ENABLED,
  baseUrl:
    cleanBaseUrl(env.BKASH_BASE_URL, ["/tokenized/checkout"]) ??
    (env.isDevelopment && env.BKASH_ENABLED ? sandboxBkashBaseUrl : undefined),
  appKey: clean(env.BKASH_APP_KEY),
  appSecret: clean(env.BKASH_APP_SECRET),
  username: clean(env.BKASH_USERNAME),
  password: clean(env.BKASH_PASSWORD),
  /** Explicit BKASH_CALLBACK_URL wins; otherwise derived per request. */
  get callbackUrl(): string | undefined {
    return resolveBkashCallbackUrl().url;
  },
};

export const isBkashConfigured = (): boolean =>
  Boolean(
    env.BKASH_ENABLED &&
      bkashConfig.baseUrl &&
      bkashConfig.appKey &&
      bkashConfig.appSecret &&
      bkashConfig.username &&
      bkashConfig.password &&
      bkashConfig.callbackUrl,
  );

export const nagadConfig = {
  enabled: env.NAGAD_ENABLED,
  simulation: env.NAGAD_SIMULATION,
  baseUrl:
    cleanBaseUrl(env.NAGAD_BASE_URL, ["/check-out"]) ??
    (env.isDevelopment && env.NAGAD_ENABLED ? sandboxNagadBaseUrl : undefined),
  merchantId: clean(env.NAGAD_MERCHANT_ID),
  merchantNumber: clean(env.NAGAD_MERCHANT_NUMBER),
  privateKey: clean(env.NAGAD_PRIVATE_KEY),
  publicKey: clean(env.NAGAD_PUBLIC_KEY),
  /** Explicit NAGAD_CALLBACK_URL wins; otherwise derived per request. */
  get callbackUrl(): string | undefined {
    return getNagadCallbackUrl();
  },
};

/**
 * True when the dev-only Nagad simulation is active. It is never allowed in
 * production so a mock gateway can never take payments in a live environment.
 */
export const isNagadSimulationEnabled = (): boolean =>
  Boolean(env.NAGAD_ENABLED && env.NAGAD_SIMULATION && !env.isProduction);

export const isNagadConfigured = (): boolean =>
  isNagadSimulationEnabled() ||
  Boolean(
    env.NAGAD_ENABLED &&
      nagadConfig.baseUrl &&
      nagadConfig.merchantId &&
      nagadConfig.merchantNumber &&
      nagadConfig.privateKey &&
      nagadConfig.publicKey &&
      nagadConfig.callbackUrl,
  );

export const cardConfig = {
  enabled: env.STRIPE_ENABLED,
  provider: "stripe",
  secretKey: clean(env.STRIPE_SECRET_KEY),
  publishableKey: clean(env.STRIPE_PUBLISHABLE_KEY),
  webhookSecret: clean(env.STRIPE_WEBHOOK_SECRET),
  currency: clean(env.STRIPE_CURRENCY)?.toLowerCase() ?? "bdt",
} as const;

export const isCardConfigured = (): boolean =>
  Boolean(
    env.STRIPE_ENABLED &&
      cardConfig.secretKey &&
      cardConfig.publishableKey,
  );

/**
 * Webhook processing needs a real signing secret. Card checkout and the
 * verified return flow work without it; unsigned webhooks stay disabled
 * instead of accepting a dummy secret shipped in the repository.
 */
export const isCardWebhookConfigured = (): boolean =>
  isCardConfigured() && Boolean(cardConfig.webhookSecret);

export const paymentProviderStatus = () => ({
  bkash: isBkashConfigured(),
  nagad: isNagadConfigured(),
  card: isCardConfigured(),
  cashOnDelivery: true,
  /**
   * Stripe publishable keys are safe to expose to browsers. Providing the key
   * here lets the storefront initialise Stripe even when the client build was
   * created without NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY. The secret key is never
   * included in this response.
   */
  cardPublishableKey: cardConfig.publishableKey ?? null,
  cardCurrency: cardConfig.currency.toUpperCase(),
});
