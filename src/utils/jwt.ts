import jwt, { type JwtPayload, type SignOptions } from "./jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { ApiError } from "./ApiError";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "../types/auth.types";

const JWT_ISSUER = "ecommerce-3d-api";
const JWT_AUDIENCE = "ecommerce-3d-client";
const PASSWORD_RESET_AUDIENCE = "ecommerce-password-reset";
const DATA_RESET_AUDIENCE = "ecommerce-data-reset";

/** Short-lived token issued after an email code has been verified. */
export const VERIFICATION_TOKEN_TTL = "10m";

export interface PasswordResetTokenPayload {
  sub: string;
  email: string;
  codeId: string;
  type: "password-reset";
}

export interface DataResetTokenPayload {
  sub: string;
  email: string;
  codeId: string;
  type: "data-reset";
}

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
): JwtPayload => {
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

const invalidVerificationTokenError = (): ApiError =>
  ApiError.badRequest(
    "This verification token is invalid or has expired. Please request a new code.",
  );

const signVerificationToken = (payload: object, audience: string): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: VERIFICATION_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: JWT_ISSUER,
    audience,
  });

const verifyVerificationToken = (
  token: string,
  audience: string,
): JwtPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: JWT_ISSUER,
      audience,
    });

    if (typeof decoded === "string") {
      throw invalidVerificationTokenError();
    }

    return decoded;
  } catch {
    throw invalidVerificationTokenError();
  }
};

interface VerificationTokenPayload {
  sub: string;
  email: string;
  codeId: string;
  type: PasswordResetTokenPayload["type"] | DataResetTokenPayload["type"];
}

const parseVerificationPayload = (
  decoded: JwtPayload,
  expectedType: VerificationTokenPayload["type"],
): VerificationTokenPayload => {
  if (
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string" ||
    typeof decoded.codeId !== "string" ||
    decoded.type !== expectedType
  ) {
    throw invalidVerificationTokenError();
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    codeId: decoded.codeId,
    type: expectedType,
  };
};

export const signPasswordResetToken = (
  payload: Omit<PasswordResetTokenPayload, "type">,
): string =>
  signVerificationToken(
    { ...payload, type: "password-reset" },
    PASSWORD_RESET_AUDIENCE,
  );

export const verifyPasswordResetToken = (
  token: string,
): PasswordResetTokenPayload => {
  const payload = parseVerificationPayload(
    verifyVerificationToken(token, PASSWORD_RESET_AUDIENCE),
    "password-reset",
  );

  return { ...payload, type: "password-reset" };
};

export const signDataResetToken = (
  payload: Omit<DataResetTokenPayload, "type">,
): string =>
  signVerificationToken(
    { ...payload, type: "data-reset" },
    DATA_RESET_AUDIENCE,
  );

export const verifyDataResetToken = (token: string): DataResetTokenPayload => {
  const payload = parseVerificationPayload(
    verifyVerificationToken(token, DATA_RESET_AUDIENCE),
    "data-reset",
  );

  return { ...payload, type: "data-reset" };
};
