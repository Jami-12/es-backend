import type { RequestHandler } from "express";
import { UserStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyAccessToken } from "../utils/jwt";

export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    throw ApiError.unauthorized(
      "Missing or invalid Authorization header. Expected: Bearer <token>",
    );
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    throw ApiError.unauthorized("Access token is missing");
  }

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.unauthorized("Invalid or expired access token");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt) {
    throw ApiError.unauthorized("The account associated with this token no longer exists");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw ApiError.forbidden("This account has been blocked");
  }

  if (user.status === UserStatus.INACTIVE || !user.isActive) {
    throw ApiError.forbidden("This account is inactive");
  }

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  };

  next();
});

export const optionalAuthenticate: RequestHandler = (req, res, next) => {
  if (!req.headers.authorization) {
    next();
    return;
  }

  void authenticate(req, res, next);
};
