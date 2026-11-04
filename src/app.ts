import cors, { type CorsOptions } from "cors";
import express, { type Request } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { errorHandler } from "./middlewares/error.middleware";
import { notFoundHandler } from "./middlewares/notFound.middleware";
import { globalRateLimiter } from "./middlewares/rateLimit.middleware";
import { apiRouter } from "./routes";
import { ApiError } from "./utils/ApiError";
import { sendSuccess } from "./utils/ApiResponse";
import { asyncHandler } from "./utils/asyncHandler";

const app = express();

const configuredOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigin: CorsOptions["origin"] =
  env.CORS_ORIGIN === "*" ? "*" : configuredOrigins;

const corsOptions: CorsOptions = {
  origin: corsOrigin,
  credentials: corsOrigin !== "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

app.disable("x-powered-by");

if (env.TRUST_PROXY > 0) {
  app.set("trust proxy", env.TRUST_PROXY);
}

app.use(helmet());
app.use(cors(corsOptions));

app.use(
  "/api/v1/payments/card/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

morgan.token("safe-url", (req) => {
  const request = req as Request;
  return request.originalUrl.split("?")[0] ?? request.path;
});

const requestLogFormat = env.isProduction
  ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":user-agent"'
  : ":method :safe-url :status :response-time ms - :res[content-length]";

app.use(
  morgan(requestLogFormat, {
    skip: (req) =>
      req.path === "/health" ||
      req.path === "/health/ready" ||
      req.path === "/api/v1/health",
  }),
);

app.use(globalRateLimiter);

app.get("/", (_req, res) => {
  sendSuccess(res, {
    data: {
      name: "3D E-Commerce API",
      version: "1.0.0",
      environment: env.NODE_ENV,
      endpoints: {
        health: "/api/v1/health",
        auth: "/api/v1/auth",
        categories: "/api/v1/categories",
        brands: "/api/v1/brands",
        products: "/api/v1/products",
        productImages: "/api/v1/products/:productId/images",
        cart: "/api/v1/cart",
        wishlist: "/api/v1/wishlist",
        addresses: "/api/v1/addresses",
        orders: "/api/v1/orders",
        payments: "/api/v1/payments",
        coupons: "/api/v1/coupons",
        reviews: "/api/v1/reviews",
        notifications: "/api/v1/notifications",
        admin: "/api/v1/admin",
        analytics: "/api/v1/analytics",
        audit: "/api/v1/audit",
        expenses: "/api/v1/expenses",
        investments: "/api/v1/investments",
        employees: "/api/v1/employees",
        salaries: "/api/v1/salaries",
        inventory: "/api/v1/inventory",
        accounting: "/api/v1/accounting",
      },
    },
    message: "Welcome to 3D E-Commerce API Server",
  });
});

app.get("/health", (_req, res) => {
  sendSuccess(res, {
    data: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    message: "Service is healthy",
  });
});

app.get(
  "/health/ready",
  asyncHandler(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ApiError(503, "Database is not reachable");
    }

    sendSuccess(res, {
      data: {
        status: "ready",
        timestamp: new Date().toISOString(),
      },
      message: "Service is ready to accept traffic",
    });
  }),
);

app.use("/api/v1", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
