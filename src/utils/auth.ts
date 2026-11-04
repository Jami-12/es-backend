import type { Request } from "express";
import { ApiError } from "./ApiError";
import type { AuthenticatedUser } from "../types/auth.types";

export const getAuthUser = (req: Request): AuthenticatedUser => {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication is required");
  }

  return req.user;
};
