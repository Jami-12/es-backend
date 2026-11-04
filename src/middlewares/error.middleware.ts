import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import multer from "multer";
import { ZodError } from "zod";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { sendError } from "../utils/ApiResponse";
import { redactText, redactValue } from "../utils/redact";

interface NormalizedError {
  statusCode: number;
  message: string;
  error?: unknown;
}

const normalizeZodError = (error: ZodError): NormalizedError => ({
  statusCode: 422,
  message: "Validation failed",
  error: error.issues.map((issue) => ({
    path: issue.path.join(".") || "root",
    message: issue.message,
    code: issue.code,
  })),
});

const normalizePrismaError = (
  error:
    | Prisma.PrismaClientKnownRequestError
    | Prisma.PrismaClientValidationError,
): NormalizedError => {
  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      message: "Invalid data supplied to the database layer",
      error: env.isProduction ? undefined : error.message,
    };
  }

  switch (error.code) {
    case "P2002": {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(", ") : String(target ?? "field");
      return {
        statusCode: 409,
        message: `A record with this ${fields} already exists`,
        error: env.isProduction ? undefined : error.meta,
      };
    }
    case "P2003":
      return {
        statusCode: 409,
        message:
          "This operation violates a relational constraint because related records exist",
        error: env.isProduction ? undefined : error.meta,
      };
    case "P2014":
      return {
        statusCode: 409,
        message: "The requested change would violate a required relation",
        error: env.isProduction ? undefined : error.meta,
      };
    case "P2025":
      return {
        statusCode: 404,
        message: "The requested record was not found",
        error: env.isProduction ? undefined : error.meta,
      };
    default:
      return {
        statusCode: 400,
        message: "Database request could not be completed",
        error: env.isProduction
          ? undefined
          : { code: error.code, meta: error.meta, message: error.message },
      };
  }
};

const normalizeError = (error: unknown): NormalizedError => {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      error: error.details,
    };
  }

  if (error instanceof ZodError) {
    return normalizeZodError(error);
  }

  if (error instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: "Each image must be 5 MB or smaller",
      LIMIT_FILE_COUNT: "Too many image files in a single request",
      LIMIT_UNEXPECTED_FILE:
        "Unexpected file field. Use \"images\" or \"image\" for product images",
      LIMIT_FIELD_COUNT: "Too many multipart fields",
      LIMIT_FIELD_KEY: "A multipart field name is too long",
      LIMIT_FIELD_VALUE: "A multipart field value is too large",
      LIMIT_PART_COUNT: "Too many multipart parts",
    };

    return {
      statusCode: error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
      message: messages[error.code] ?? "Image upload failed",
    };
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError
  ) {
    return normalizePrismaError(error);
  }

  if (error instanceof TokenExpiredError) {
    return { statusCode: 401, message: "Access token has expired" };
  }

  if (error instanceof JsonWebTokenError) {
    return { statusCode: 401, message: "Invalid access token" };
  }

  if (error instanceof SyntaxError && "body" in error) {
    return { statusCode: 400, message: "Malformed JSON request body" };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      message: env.isProduction ? "Internal server error" : error.message,
      error: env.isProduction ? undefined : error.stack,
    };
  }

  return {
    statusCode: 500,
    message: "Internal server error",
    error: env.isProduction ? undefined : error,
  };
};

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  next,
): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const normalized = normalizeError(error);

  if (normalized.statusCode >= 500) {
    console.error(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl.split("?")[0]} failed:`,
      redactValue(error),
    );
  }

  sendError(res, {
    statusCode: normalized.statusCode,
    message: redactText(normalized.message),
    error: redactValue(normalized.error),
  });
};
