/**
 * Deterministic environment for the automated test suite.
 *
 * This module must be imported before anything from `src/`, because
 * `src/config/env.ts` validates the environment once at import time. Tests use
 * fake gateway credentials only; no real payment request is made.
 */
process.env.NODE_ENV = "test";

process.env.DATABASE_URL =
  "postgresql://unit_test:unit_test@127.0.0.1:5432/unit_test?schema=public";

process.env.JWT_ACCESS_SECRET =
  "unit-test-access-secret-0123456789abcdef";
process.env.JWT_REFRESH_SECRET =
  "unit-test-refresh-secret-0123456789abcdef";

process.env.FRONTEND_URL = "http://localhost:3000";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.PUBLIC_BASE_URL = "http://localhost:4000";

process.env.STORE_NAME = "Test Store";
process.env.STORE_ADDRESS = "Dhaka, Bangladesh";
process.env.STORE_PHONE = "+8801000000000";
process.env.STORE_EMAIL = "support@example.com";
process.env.STORE_CURRENCY = "BDT";

process.env.PAYMENT_WEBHOOK_SECRET =
  "unit-test-webhook-secret-0123456789abcdef";

process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";

process.env.BKASH_ENABLED = "true";
process.env.BKASH_BASE_URL =
  "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
process.env.BKASH_APP_KEY = "unit-test-bkash-app-key";
process.env.BKASH_APP_SECRET = "unit-test-bkash-app-secret";
process.env.BKASH_USERNAME = "unit-test-bkash-user";
process.env.BKASH_PASSWORD = "unit-test-bkash-password";
process.env.BKASH_CALLBACK_URL =
  "http://localhost:4000/api/v1/payments/bkash/callback";

process.env.NAGAD_ENABLED = "true";
process.env.NAGAD_BASE_URL =
  "http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs";
process.env.NAGAD_MERCHANT_ID = "unit-test-nagad-merchant";
process.env.NAGAD_MERCHANT_NUMBER = "01700000000";
process.env.NAGAD_PRIVATE_KEY = "unit-test-private-key";
process.env.NAGAD_PUBLIC_KEY = "unit-test-public-key";
process.env.NAGAD_CALLBACK_URL =
  "http://localhost:4000/api/v1/payments/nagad/callback";

process.env.STRIPE_ENABLED = "true";
process.env.STRIPE_SECRET_KEY = "sk_test_unit_test_dummy";
process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_unit_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit_test_webhook_secret";
process.env.STRIPE_CURRENCY = "BDT";

process.env.CARD_PROVIDER = "";
process.env.CARD_SECRET_KEY = "";
process.env.CARD_PUBLISHABLE_KEY = "";
process.env.CARD_WEBHOOK_SECRET = "";
process.env.CARD_CURRENCY = "";

process.env.CLOUDINARY_ENABLED = "false";

process.env.SUPER_ADMIN_NAME = "Test Super Admin";
process.env.SUPER_ADMIN_EMAIL = "admin@example.com";
process.env.SUPER_ADMIN_PASSWORD = "Unit-Test-Passphrase-123!";
