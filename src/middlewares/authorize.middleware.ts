import type { RequestHandler } from "express";
import type { Role } from "@prisma/client";
import { ApiError } from "../utils/ApiError";

export const authorize = (allowedRoles: Role[]): RequestHandler => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication is required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Role ${req.user.role} is not permitted to access this resource`,
        ),
      );
    }

    return next();
  };
};
