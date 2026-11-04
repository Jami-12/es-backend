import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { comparePassword, hashPassword } from "../../utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import type {
  AuthResult,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UserPublic,
} from "../../types/auth.types";

const authUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  role: true,
  status: true,
  provider: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

const toUserPublic = (user: AuthUserRecord): UserPublic => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  image: user.image,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

const assertUserCanAuthenticate = (user: {
  status: UserStatus;
  isActive: boolean;
  deletedAt: Date | null;
}): void => {
  if (user.deletedAt) {
    throw ApiError.unauthorized(
      "The account associated with this request no longer exists",
    );
  }

  if (user.status === UserStatus.BLOCKED) {
    throw ApiError.forbidden("This account has been blocked");
  }

  if (user.status === UserStatus.INACTIVE || !user.isActive) {
    throw ApiError.forbidden("This account is inactive");
  }
};

const buildAuthResult = (user: AuthUserRecord): AuthResult => ({
  user: toUserPublic(user),
  accessToken: signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  }),
  refreshToken: signRefreshToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  }),
  tokenType: "Bearer",
  expiresIn: env.JWT_ACCESS_EXPIRES_IN,
});

export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const email = input.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw ApiError.conflict("An account with this email already exists");
  }

  const hashedPassword = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      password: hashedPassword,
      phone: input.phone?.trim() || null,
      role: Role.CUSTOMER,
      status: UserStatus.ACTIVE,
      cart: { create: {} },
    },
    select: authUserSelect,
  });

  return buildAuthResult(user);
};

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      ...authUserSelect,
      password: true,
    },
  });

  if (!user || !user.password) {
    throw ApiError.unauthorized(
      user && user.provider === "GOOGLE"
        ? "This account uses Google sign-in. Please continue with Google."
        : "Invalid email or password",
    );
  }

  const passwordMatches = await comparePassword(input.password, user.password);

  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  assertUserCanAuthenticate(user);

  const { password: _password, ...safeUser } = user;

  return buildAuthResult(safeUser);
};

export const refresh = async (refreshToken: string): Promise<AuthResult> => {
  const payload = verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: authUserSelect,
  });

  if (!user) {
    throw ApiError.unauthorized("The account associated with this token no longer exists");
  }

  assertUserCanAuthenticate(user);

  return buildAuthResult(user);
};

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  image?: string;
  emailVerified: boolean;
}

export const loginWithGoogle = async (
  profile: GoogleProfile,
): Promise<AuthResult> => {
  if (!profile.email || !profile.emailVerified) {
    throw ApiError.unauthorized(
      "Google did not return a verified email address for this account",
    );
  }

  const email = profile.email.trim().toLowerCase();

  const existingByGoogleId = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
    select: authUserSelect,
  });

  if (existingByGoogleId) {
    assertUserCanAuthenticate(existingByGoogleId);

    const user = await prisma.user.update({
      where: { id: existingByGoogleId.id },
      data: {
        provider: "GOOGLE",
        isEmailVerified: true,
        image: existingByGoogleId.image ?? profile.image ?? null,
      },
      select: authUserSelect,
    });

    return buildAuthResult(user);
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
    select: authUserSelect,
  });

  if (existingByEmail) {
    assertUserCanAuthenticate(existingByEmail);

    const user = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        googleId: profile.googleId,
        provider: "GOOGLE",
        isEmailVerified: true,
        image: existingByEmail.image ?? profile.image ?? null,
      },
      select: authUserSelect,
    });

    return buildAuthResult(user);
  }

  const user = await prisma.user.create({
    data: {
      name: profile.name.trim() || email.split("@")[0],
      email,
      password: null,
      image: profile.image ?? null,
      role: Role.CUSTOMER,
      status: UserStatus.ACTIVE,
      provider: "GOOGLE",
      googleId: profile.googleId,
      isActive: true,
      isEmailVerified: true,
      cart: { create: {} },
    },
    select: authUserSelect,
  });

  return buildAuthResult(user);
};

export const getProfile = async (userId: string): Promise<UserPublic> => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: authUserSelect,
  });

  if (!user) {
    throw ApiError.notFound("User account not found");
  }

  assertUserCanAuthenticate(user);

  return toUserPublic(user);
};

export const changePassword = async (
  userId: string,
  input: ChangePasswordInput,
): Promise<void> => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      password: true,
    },
  });

  if (!user) {
    throw ApiError.notFound("User account not found");
  }

  if (user.password) {
    if (!input.currentPassword) {
      throw ApiError.badRequest("Current password is required");
    }

    const currentPasswordMatches = await comparePassword(
      input.currentPassword,
      user.password,
    );

    if (!currentPasswordMatches) {
      throw ApiError.badRequest("Current password is incorrect");
    }

    const sameAsCurrent = await comparePassword(
      input.newPassword,
      user.password,
    );

    if (sameAsCurrent) {
      throw ApiError.badRequest(
        "New password must be different from the current password",
      );
    }
  }

  const hashedPassword = await hashPassword(input.newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  await recordAudit({
    userId,
    action: "CHANGE_PASSWORD",
    entity: "User",
    entityId: userId,
    description: `Changed password for ${user.email}`,
  });
};
