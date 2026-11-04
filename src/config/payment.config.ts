import { env } from "./env";

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const sandboxBkashBaseUrl = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
const sandboxNagadBaseUrl =
  "http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs";

export const bkashConfig = {
  enabled: env.BKASH_ENABLED,
  baseUrl:
    clean(env.BKASH_BASE_URL) ??
    (env.isDevelopment && env.BKASH_ENABLED ? sandboxBkashBaseUrl : undefined),
  appKey: clean(env.BKASH_APP_KEY),
  appSecret: clean(env.BKASH_APP_SECRET),
  username: clean(env.BKASH_USERNAME),
  password: clean(env.BKASH_PASSWORD),
  callbackUrl: clean(env.BKASH_CALLBACK_URL),
} as const;

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
  baseUrl:
    clean(env.NAGAD_BASE_URL) ??
    (env.isDevelopment && env.NAGAD_ENABLED ? sandboxNagadBaseUrl : undefined),
  merchantId: clean(env.NAGAD_MERCHANT_ID),
  merchantNumber: clean(env.NAGAD_MERCHANT_NUMBER),
  privateKey: clean(env.NAGAD_PRIVATE_KEY),
  publicKey: clean(env.NAGAD_PUBLIC_KEY),
  callbackUrl: clean(env.NAGAD_CALLBACK_URL),
} as const;

export const isNagadConfigured = (): boolean =>
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
      cardConfig.webhookSecret,
  );

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
