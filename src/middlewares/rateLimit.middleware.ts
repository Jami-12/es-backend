import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import { env } from "../config/env";
import { sendError } from "../utils/ApiResponse";

const createLimiter = (
  windowMs: number,
  limit: number,
  message: string,
  skipSuccessfulRequests = false,
): RequestHandler => {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (_req, res) => {
      sendError(res, {
        statusCode: 429,
        message,
      });
    },
  });
};

export const globalRateLimiter = createLimiter(
  env.RATE_LIMIT_WINDOW_MS,
  env.RATE_LIMIT_MAX,
  "Too many requests from this IP. Please try again later.",
);

export const authRateLimiter = createLimiter(
  env.RATE_LIMIT_WINDOW_MS,
  env.AUTH_RATE_LIMIT_MAX,
  "Too many authentication attempts. Please try again later.",
  true,
);
