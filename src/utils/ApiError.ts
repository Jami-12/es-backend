export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, ApiError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad request", details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Authentication required", details?: unknown): ApiError {
    return new ApiError(401, message, details);
  }

  static forbidden(message = "You do not have permission to perform this action", details?: unknown): ApiError {
    return new ApiError(403, message, details);
  }

  static notFound(message = "Resource not found", details?: unknown): ApiError {
    return new ApiError(404, message, details);
  }

  static conflict(message = "Resource conflict", details?: unknown): ApiError {
    return new ApiError(409, message, details);
  }

  static unprocessable(message = "Validation failed", details?: unknown): ApiError {
    return new ApiError(422, message, details);
  }

  static internal(message = "Internal server error", details?: unknown): ApiError {
    return new ApiError(500, message, details, false);
  }
}
