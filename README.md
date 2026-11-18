# 3D E-Commerce API

Node.js, TypeScript, Express, Prisma and PostgreSQL backend for the 3D commerce store.

## Security First

- Never commit `.env`, private keys, PEM files, database URLs or provider credentials.
- `.env`, `.env.*`, `*.key`, `*.pem`, `*.crt`, `*.p12` and `*.pfx` are ignored by git.
- Only `.env.example` is committed. It contains placeholders, never real values.
- If credentials were ever exposed, treat them as compromised and rotate them:
  - PostgreSQL password / database URL
  - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
  - Google OAuth client secret
  - bKash app key, app secret, username and password
  - Nagad merchant credentials and RSA key pair
  - Stripe secret key and webhook secret
  - Cloudinary API key and API secret
  - Super-admin password
- Online payment providers and Cloudinary are disabled by default. Enable each one only after its credentials have been rotated and verified.

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL database (local or hosted)

## Installation

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

The API starts on `http://localhost:4000` by default.

To create the initial super-admin and sample catalog data:

```bash
npm run db:seed
```

`npm run db:seed` requires a strong `SUPER_ADMIN_PASSWORD`. It does not overwrite an existing super-admin password unless `SEED_RESET_SUPER_ADMIN_PASSWORD=true`.

## Environment Setup

Create your local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in real values in `.env`. Never put real values in `.env.example`, README files, source code or chat messages.

### Required Variables

| Variable | Description |
| --- | --- |
| `NODE_ENV` | `development`, `test` or `production` |
| `PORT` | HTTP port, for example `4000` |
| `DATABASE_URL` | PostgreSQL URL in Prisma format |
| `JWT_ACCESS_SECRET` | Random secret, at least 32 characters |
| `JWT_ACCESS_EXPIRES_IN` | Access-token duration, for example `15m` or `7d` |
| `JWT_REFRESH_SECRET` | Different random secret, at least 32 characters |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token duration, for example `30d` |
| `BCRYPT_SALT_ROUNDS` | Integer from 10 to 15; use `12` |
| `FRONTEND_URL` | Frontend origin, for example `http://localhost:3000` |
| `SUPER_ADMIN_PASSWORD` | Strong password, at least 12 characters, not a placeholder |

`DATABASE_URL` must use the PostgreSQL format:

```text
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

URL-encode special characters in the password. For example, `@` becomes `%40`.

The `?schema=public` parameter is optional. Omit it if your PostgreSQL host or connection pooler rejects it; the default schema is still `public`.

### Recommended Variables

| Variable | Default | Description |
| --- | --- | --- |
| `CLIENT_URL` | `FRONTEND_URL` | Used for payment callback redirects |
| `CORS_ORIGIN` | `FRONTEND_URL` | Comma-separated allowed origins, or `*` |
| `PUBLIC_BASE_URL` | `http://localhost:PORT` | Public API base URL |
| `TRUST_PROXY` | `0` | Express trust-proxy setting |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Global rate-limit window |
| `RATE_LIMIT_MAX` | `300` | Global requests per window |
| `AUTH_RATE_LIMIT_MAX` | `20` | Auth requests per window |
| `STORE_NAME` | `3D Commerce` | Store name for invoices |
| `STORE_ADDRESS` | `Dhaka, Bangladesh` | Store address |
| `STORE_PHONE` | `+8801000000000` | Store phone |
| `STORE_EMAIL` | `support@example.com` | Store email |
| `STORE_CURRENCY` | `BDT` | Three-letter currency code |
| `SHIPPING_FLAT_RATE` | `60` | Flat shipping charge |
| `FREE_SHIPPING_THRESHOLD` | `1000` | Free-shipping order threshold |
| `LOW_STOCK_THRESHOLD` | `5` | Low-stock warning threshold |

Generate strong secrets with Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Use a different value for each JWT secret.

### Google OAuth

Set these only if Google login is needed:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/v1/auth/google/callback
GOOGLE_SUCCESS_REDIRECT_URL=http://localhost:3000/auth/callback
```

The callback URL in Google Cloud Console must exactly match `GOOGLE_CALLBACK_URL`.

### bKash

bKash is disabled until `BKASH_ENABLED=true` and all required values are present. Use sandbox credentials issued for bKash Tokenized Checkout; never point a development environment at the production bKash host.

```text
BKASH_ENABLED=false
BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta
BKASH_APP_KEY=
BKASH_APP_SECRET=
BKASH_USERNAME=
BKASH_PASSWORD=
BKASH_CALLBACK_URL=http://localhost:4000/api/v1/payments/bkash/callback
```

Startup validation fails if bKash is enabled with missing credentials, or if a non-production environment uses a host other than the official sandbox hosts (`tokenized.sandbox.bka.sh` or `sandbox.bka.sh`).

The callback URL must be reachable by bKash's servers. `http://localhost:4000` only works when bKash can reach it, so use a public HTTPS tunnel (for example ngrok) during local sandbox testing and set `BKASH_CALLBACK_URL` to the tunnel URL.

### Nagad

Nagad is disabled until `NAGAD_ENABLED=true` and all required values are present:

```text
NAGAD_ENABLED=false
NAGAD_BASE_URL=http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs
NAGAD_MERCHANT_ID=
NAGAD_MERCHANT_NUMBER=
NAGAD_PRIVATE_KEY=
NAGAD_PUBLIC_KEY=
NAGAD_CALLBACK_URL=http://localhost:4000/api/v1/payments/nagad/callback
```

PEM keys may use `\n` escapes inside a quoted value. Missing or mismatched keys are reported without printing key material. Startup validation fails if Nagad is enabled with missing credentials. The classic sandbox endpoint uses plain HTTP on port 10080 and must be reachable from the server; the callback URL must also be reachable by Nagad.

### Stripe / Card

Stripe is disabled until `STRIPE_ENABLED=true`, a secret key, a publishable key and a webhook secret are present:

```text
STRIPE_ENABLED=false
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CURRENCY=BDT
```

`STRIPE_PUBLISHABLE_KEY` is safe to expose to browsers and is returned by `GET /api/v1/payments/providers` so the storefront can initialise Stripe Elements. The secret key is never returned. `STRIPE_CURRENCY` must match `STORE_CURRENCY`, and `STRIPE_WEBHOOK_SECRET` must be the signing secret for the `/api/v1/payments/card/webhook` endpoint.

Card data is handled by Stripe. It never reaches this server.

### Cash on Delivery

Cash on Delivery requires no gateway credentials. The payment stays `PENDING` until an admin marks the order `DELIVERED`, at which point the payment is recorded as `PAID` and the income ledger entry is created.

### Refund handling

Cancelling or returning a paid order marks its payment `REFUNDED`, stores the refunded amount and writes a `SALES_REFUND` ledger entry. This build does **not** call bKash, Nagad or Stripe refund APIs automatically. Issue the actual gateway refund through the provider dashboard (or add and test a provider refund integration) before treating the `REFUNDED` status as proof that funds were returned. Cash-on-delivery refunds are handled manually.

### Cloudinary

Product image uploads are disabled until `CLOUDINARY_ENABLED=true` and all three credentials are present:

```text
CLOUDINARY_ENABLED=false
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=ecommerce-products
```

Existing image URLs continue to display while uploads are disabled.

## Environment Validation

Environment variables are validated with Zod at startup in `src/config/env.ts`.

The process exits with a clear message when:

- `DATABASE_URL` is missing, malformed, not PostgreSQL, or missing credentials/database name
- JWT secrets are missing, shorter than 32 characters, or identical
- JWT expiration values are not valid durations
- URLs are malformed
- `CORS_ORIGIN` is not `*` or a comma-separated list of HTTP(S) URLs
- `BCRYPT_SALT_ROUNDS` is outside 10-15
- The super-admin password is missing, too short, or a placeholder
- An enabled payment provider or Cloudinary is missing required credentials
- Google client ID and secret are configured without each other

Payment and Cloudinary credentials are optional while their feature flags are `false`.

## Prisma

Useful commands:

```bash
npx prisma generate
npx prisma validate
npx prisma migrate dev
npx prisma migrate deploy
npx prisma migrate status
npx prisma studio
npm run db:seed
```

- Development: run migrations with `npx prisma migrate dev`.
- Production: apply committed migrations with `npx prisma migrate deploy`.
- The Prisma client is created once in `src/config/prisma.ts` and reused.
- Startup fails safely if the database cannot be reached.

## Security Controls

- Helmet security headers
- CORS allowlist from `CORS_ORIGIN`
- Global and auth-specific rate limiting
- Zod request validation
- JWT access and refresh secrets separated
- Password hashing with bcrypt
- Role-based authorization for admin and super-admin routes
- Raw Stripe webhook body handling before JSON parsing
- Stripe webhook signature and timestamp verification
- Provider payment amount and order-reference verification
- Sensitive values redacted from logs and error responses
- `.env` and key files excluded from git

## Health Checks

- `GET /health`
- `GET /health/ready`
- `GET /api/v1/health`

The readiness endpoint checks database connectivity.

## Troubleshooting

### Server exits with `Invalid environment configuration`

Read the listed variable names, update `.env`, and restart. The message never prints secret values.

### `DATABASE_URL is not a valid URL`

Use a plain PostgreSQL URL. Do not paste Markdown links such as `[url](url)`, and do not include escape characters.

### `prisma migrate dev` cannot connect

Check the database host, port, username, password and database name. For hosted databases, confirm SSL settings such as `sslmode=require`.

### Prisma CLI works but the server cannot reach the database

Some hosted PostgreSQL poolers reject the `schema` query parameter. Remove `?schema=public` from `DATABASE_URL` and restart. The default schema remains `public`.

### Payment provider returns 503

The provider is disabled or missing credentials. Rotate the provider credentials, add them to `.env`, set the matching `*_ENABLED` flag to `true`, and restart.

### Product image upload returns 503

Cloudinary is disabled. Rotate the Cloudinary credentials, add them to `.env`, set `CLOUDINARY_ENABLED=true`, and restart.
