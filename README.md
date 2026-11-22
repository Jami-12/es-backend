# E-Commerce API (`server`)

Express + TypeScript + Prisma backend for the Store/JAMI commerce platform. It serves the public storefront, customer account actions, admin console, and super-admin back office from a single API mounted at `/api/v1`.

---

## 1. Requirements

- Node.js `22.x` (pinned in `engines.node`)
- npm (`package-lock.json`)
- PostgreSQL; Prisma `6.19.3`
- Optional providers: Cloudinary, SMTP, Google OAuth, bKash, Nagad, Stripe

No OpenAI, AI SDK, or other AI package is used by this server.

## 2. Setup

```bash
# from D:\E commerce Shop\server
npm install
cp .env.example .env
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate      # first run / schema changes
npm run db:seed             # optional super-admin and demo data
npm run dev
```

The API listens on `http://localhost:4000` by default. Public roots: `GET /`, `GET /health`, `GET /health/ready`, and `GET /api/v1` (endpoint index).

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | `tsup` → ESM `dist/server.js` + CJS `dist/server.cjs` |
| `npm start` | Run the ESM build |
| `npm run lint` | `tsc -p tsconfig.json --noEmit` |
| `npm test` | Node test runner suite for gateways and payment/order flows |
| `npm run prisma:validate` | Validate the Prisma schema |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:deploy` | `prisma migrate deploy` (production) |
| `npm run prisma:status` | Migration status |
| `npm run prisma:studio` | Prisma Studio |
| `npm run db:push` | `prisma db push` |
| `npm run db:seed` | Run `prisma/seed.ts` |

Validation used for this project: `npx prisma validate`, `npx prisma generate`, `npm run lint`, `npm run build`.

## 3. Environment variables

Grouped from `.env.example`. `.env` is never deployed; set these in the host/dashboard.

**Core**

`NODE_ENV=development`, `PORT=4000`, `DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ecommerce_db?schema=public`

**Auth and security**

`JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN=7d`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN=30d`, `BCRYPT_SALT_ROUNDS=12`

**Network**

`FRONTEND_URL=http://localhost:3000`, `CLIENT_URL=http://localhost:3000`, `CORS_ORIGIN=http://localhost:3000`, `PUBLIC_BASE_URL=http://localhost:4000`, `TRUST_PROXY=0`, `RATE_LIMIT_WINDOW_MS=900000`, `RATE_LIMIT_MAX=300`, `AUTH_RATE_LIMIT_MAX=20`

**Store and seed**

`STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE`, `STORE_EMAIL`, `STORE_CURRENCY=BDT`, `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SEED_RESET_SUPER_ADMIN_PASSWORD=true`

**Email (Nodemailer)**

`SMTP_ENABLED=false`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE=false`

**Shipping and inventory**

`SHIPPING_FLAT_RATE=60`, `FREE_SHIPPING_THRESHOLD=1000`, `LOW_STOCK_THRESHOLD=5`

**Webhook / OAuth**

`PAYMENT_WEBHOOK_SECRET` (optional, commented in the example), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_SUCCESS_REDIRECT_URL`

**bKash** (tokenized checkout)

`BKASH_ENABLED=false`, `BKASH_BASE_URL`, `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_CALLBACK_URL`

`BKASH_CALLBACK_URL` must be a clean absolute URL pointing only to `/api/v1/payments/bkash/callback`, with no query string, hash, trailing slash, or `?orderId=`. If omitted, it is built from `PUBLIC_BASE_URL`. bKash appends `paymentID` and `status` itself; callbacks correlate by `paymentID`.

**Nagad**

`NAGAD_ENABLED=false`, `NAGAD_SIMULATION=false`, `NAGAD_BASE_URL`, `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_NUMBER`, `NAGAD_PRIVATE_KEY`, `NAGAD_PUBLIC_KEY`, `NAGAD_CALLBACK_URL`

**Stripe / card**

`STRIPE_ENABLED=false`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY=BDT`

**Cloudinary**

`CLOUDINARY_ENABLED=false`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER=ecommerce-products`

`VERCEL` is injected by Vercel and must not be set manually. Environment validation fails fast with a descriptive error on invalid or incomplete configuration.

## 4. Architecture

```text
api/index.ts (Vercel shim) ──> dist/api/index.js (bundled handler) ──> src/app.ts
src/server.ts              ──> app.listen() only for local/container runs
src/routes/index.ts    ──> /api/v1 route mounting
src/modules/*          ──> controllers + services per domain
prisma/schema.prisma   ──> data model
```

- `src/app.ts` creates the Express app, applies helmet/CORS/rate limiting/logging, mounts `/api/v1`, and exports the app as both named and default export.
- `src/server.ts` is the only file that calls `app.listen()`; the call sits inside `startServer()` guarded by `if (!env.VERCEL)`.
- Prisma Client is cached on `globalThis` so warm serverless invocations reuse one connection pool.
- `src/utils/money.ts` and `src/utils/productPricing.ts` centralize rounding and effective-price resolution; cart, checkout, and coupon validation all use the same helpers.

## 5. API routes

All paths below are relative to `/api/v1` unless stated otherwise.

**Public / auth**: `/auth` (register, login, refresh, forgot-password send-code/verify-code/reset, Google OAuth, `/me`, change-password); `/users/me`; `/categories`, `/brands`, `/products`, `/products/slug/:slug`, `/products/:productId/images`, `/products/:productId/reviews`, `/banners`, `/settings`, `/settings/receipt`, `/orders/track`, `/payments/providers`, `/payments/bkash/*`, `/payments/nagad/*`, `/payments/card/webhook`, `/payments/webhook`, `/coupons/validate`.

**Customer**: `/cart`, `/wishlist`, `/addresses`, `/orders` (checkout, list, receipt, cancel), `/notes`, `/notifications`, `/payments/initiate`, `/payments/card/reconcile`, `/payments/:id/confirm|fail`.

**Admin**: `/admin/orders`, `/admin/cash-collections`, `/admin/customers`, `/admin/users`, `/admin/analytics`, `/admin/audit-logs`, `/admin` (categories/brands/products/images/banners/coupons/reviews/settings/expenses), `/inventory`, `/expenses`, `/investments`, `/employees`, `/salaries`.

**Super-admin**: `/super-admin` user/role management, discounts, settings, data-reset; `/analytics` (overview, revenue, payments, orders, dashboard, inventory, employees, bills, profit-loss); `/accounting` (dashboard, summary, reports, transactions); `/audit`.

Representative endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/orders/checkout` | Create order, calculate totals, reserve stock |
| `GET` | `/orders/:id/receipt` | Receipt with distinct subtotal/discount/shipping/total |
| `POST` | `/orders/:id/cancel` | Cancel with stock restore and refund ledger entry |
| `PATCH` | `/admin/orders/:id/collect-payment` | Collect COD payment |
| `GET` | `/admin/cash-collections` | Dedicated cash collection cards and summary |
| `PATCH` | `/admin/cash-collections/:id/collect` | One-click collection for any payment method |
| `GET` | `/accounting/summary` | Financial summary with product vs shipping revenue |
| `GET` | `/analytics/revenue` | Revenue series excluding cancelled/returned orders |

## 6. Prisma models

`User`, `Note`, `VerificationCode`, `Category`, `Brand`, `Banner`, `SiteSettings`, `HomeCategorySection`, `Product`, `ProductDiscount`, `ProductImage`, `Cart`, `CartItem`, `Wishlist`, `Address`, `Order`, `OrderItem`, `Payment`, `Coupon`, `Review`, `Notification`, `ReceiptSettings`, `AuditLog`, `Expense`, `Investment`, `Employee`, `SalaryPayment`, `FinancialTransaction`, `InventoryLog`

`prisma.config.ts` points to `prisma/schema.prisma`, migrations in `prisma/migrations`, and seed command `tsx prisma/seed.ts`.

## 7. Money and accounting model

- `Order.subtotal` is the **product subtotal only** (sum of line prices after product discounts, before coupons).
- Coupons discount the product subtotal. Shipping is calculated from the pre-discount product subtotal using `SHIPPING_FLAT_RATE` and `FREE_SHIPPING_THRESHOLD`, so cart estimates, checkout, and the final charge agree.
- `Order.totalAmount = subtotal − discountAmount + shippingCost + taxAmount` (tax is currently zero). `Payment.amount` equals `totalAmount`.
- Shipping is never added to product prices, `OrderItem` prices, product subtotals, or product revenue.
- Every order appears in cash collection; cancelled/returned orders and cancelled/refunded payments are non-collectable. Cash collection amounts use `payment.amount` because that is the cash actually due.
- Financial summaries expose `revenue.productSales`, `revenue.shipping`, `revenue.sales` (cash collected), and `orders.salesValue` (product-only). Profit margin uses product-only profit and product-only revenue so shipping cannot distort it.
- Analytics revenue aggregates exclude cancelled and returned orders.

## 8. Vercel deployment

This project uses the standard Express + TypeScript + Prisma serverless setup.

1. Set the Vercel project Root Directory to `server` if deploying from a monorepo root. Leave Output Directory unset (root `.`) so Vercel discovers `api/index.ts` and traces the bundle it imports from `dist/`. If the dashboard sets Output Directory to `dist`, the same build also emits a self-contained `dist/api/index.js` that Vercel can use directly. Either way, `npm run build` produces the function where the runtime expects it.
2. `vercel.json` uses a modern rewrite: `/(.*)` → `/api/index`. There is no `public` directory requirement and no legacy `builds` override. The function has a 30 s `maxDuration`.
3. `api/index.ts` is a thin shim that imports `../dist/api/index.js` with an explicit `.js` extension and exports it as both `handler` and `default`. `src/vercel.ts` is the tsup entry that bundles the Express app and all local `src/` imports into `dist/api/index.js`, so Vercel never has to resolve extensionless ESM imports such as `../src/app` at runtime. Express itself is a valid Node request handler, so no serverless adapter is needed. The rewrite preserves the original path, so `/`, `/health`, and `/api/v1/*` still match.
4. `src/server.ts` owns the only `app.listen()` call, inside `startServer()`, guarded by `if (!env.VERCEL)`. Vercel never imports that file, and there are no `process.exit` calls on the serverless path.
5. `package.json` uses `"type": "module"` with an exports map (`import` → `dist/server.js`, `require` → `dist/server.cjs`). `tsup` builds ESM and CJS for `node22` from two entries (`src/server.ts` and `src/vercel.ts` → `dist/api/index.js`), inlining local imports while keeping `node_modules` (including `@prisma/client`) external. `tsconfig.json` uses `ESNext`/`bundler` and includes `api/**/*.ts`, so the build has no ESM/CommonJS mismatch.
6. `postinstall` runs `prisma generate`; Prisma and esbuild install scripts are explicitly allow-listed in `package.json`.
7. Add all environment variables from `.env.example` in the Vercel dashboard, especially `DATABASE_URL`, JWT secrets, `CORS_ORIGIN` (deployed storefront origin), provider keys, and `PUBLIC_BASE_URL`/`BKASH_CALLBACK_URL` for payment callbacks. `VERCEL` is injected automatically.
8. Deploy from `server/` with `npm run build && vercel --prod`, or let Vercel run the configured build command.

Prisma clients are cached on `globalThis` for warm invocations; `src/app.ts` trusts one proxy hop on Vercel so rate limiting and audit logs see the real client IP.
