import jwt, { type SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { ApiError } from "./ApiError";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "../types/auth.types";

const JWT_ISSUER = "ecommerce-3d-api";
const JWT_AUDIENCE = "ecommerce-3d-client";

const isRole = (value: unknown): value is Role => {
  return (
    typeof value === "string" &&
    (Object.values(Role) as string[]).includes(value)
  );
};

const signToken = (
  payload: object,
  secret: string,
  expiresIn: string,
): string => {
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as SignOptions["expiresIn"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
};

const verifyToken = (
  token: string,
  secret: string,
): jwt.JwtPayload => {
  const decoded = jwt.verify(token, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (typeof decoded === "string") {
    throw ApiError.unauthorized("Invalid token payload");
  }

  return decoded;
};

export const signAccessToken = (
  payload: Omit<AccessTokenPayload, "type">,
): string => {
  return signToken(
    { ...payload, type: "access" },
    env.JWT_ACCESS_SECRET,
    env.JWT_ACCESS_EXPIRES_IN,
  );
};

export const signRefreshToken = (
  payload: Omit<RefreshTokenPayload, "type">,
): string => {
  return signToken(
    { ...payload, type: "refresh" },
    env.JWT_REFRESH_SECRET,
    env.JWT_REFRESH_EXPIRES_IN,
  );
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = verifyToken(token, env.JWT_ACCESS_SECRET);

  if (
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string" ||
    !isRole(decoded.role) ||
    decoded.type !== "access"
  ) {
    throw ApiError.unauthorized("Invalid access token payload");
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    type: "access",
  };
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const decoded = verifyToken(token, env.JWT_REFRESH_SECRET);

  if (
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string" ||
    !isRole(decoded.role) ||
    decoded.type !== "refresh"
  ) {
    throw ApiError.unauthorized("Invalid refresh token payload");
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    type: "refresh",
  };
};
