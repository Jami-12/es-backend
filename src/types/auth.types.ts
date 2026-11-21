import type { Role, UserStatus } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: "refresh";
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
}

export interface UserPublic {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResult {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

export interface SendPasswordResetCodeInput {
  email: string;
}

export interface VerifyPasswordResetCodeInput {
  email: string;
  code: string;
}

/** Reset accepts either a token from verify-code or email + code directly. */
export interface ResetPasswordInput {
  resetToken?: string;
  email?: string;
  code?: string;
  newPassword: string;
}

export interface PasswordResetVerification {
  resetToken: string;
  expiresIn: string;
}
