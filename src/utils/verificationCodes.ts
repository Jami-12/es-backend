import { randomInt } from "node:crypto";

import { VerificationCodePurpose } from "@prisma/client";

import { prisma } from "../config/prisma";
import { ApiError } from "./ApiError";
import { comparePassword, hashPassword } from "./password";

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_VERIFICATION_ATTEMPTS = 5;

export interface IssuedVerificationCode {
  /** Internal id used by the short-lived verification token. */
  id: string;
  /** Plaintext code, returned once so the caller can email it. Never log it. */
  code: string;
  expiresAt: Date;
}

const invalidCodeError = (): ApiError =>
  ApiError.badRequest(
    "The verification code is invalid or has expired. Please request a new one.",
  );

/** Generates a zero-padded 6-digit code with a cryptographically secure RNG. */
export const generateNumericCode = (): string =>
  randomInt(0, 1_000_000).toString().padStart(6, "0");

/**
 * Replaces any previous code for the same email/purpose, so only the newest
 * code can ever be verified.
 */
export const issueVerificationCode = async (input: {
  email: string;
  userId: string;
  purpose: VerificationCodePurpose;
}): Promise<IssuedVerificationCode> => {
  const code = generateNumericCode();
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

  const record = await prisma.$transaction(async (tx) => {
    await tx.verificationCode.deleteMany({
      where: { email: input.email, purpose: input.purpose },
    });

    return tx.verificationCode.create({
      data: {
        userId: input.userId,
        email: input.email,
        purpose: input.purpose,
        codeHash,
        maxAttempts: MAX_VERIFICATION_ATTEMPTS,
        expiresAt,
      },
      select: { id: true },
    });
  });

  return { id: record.id, code, expiresAt };
};

export const discardVerificationCode = async (id: string): Promise<void> => {
  await prisma.verificationCode.deleteMany({ where: { id } });
};

/** Deletes every code of a purpose for an email (used after a successful reset). */
export const clearVerificationCodes = async (input: {
  email: string;
  purpose: VerificationCodePurpose;
}): Promise<void> => {
  await prisma.verificationCode.deleteMany({
    where: { email: input.email, purpose: input.purpose },
  });
};

export interface VerifyCodeInput {
  purpose: VerificationCodePurpose;
  code: string;
  /** Exactly one of userId/email identifies the code owner. */
  userId?: string;
  email?: string;
  /** Allows re-checking a code that was already marked as verified. */
  allowVerified?: boolean;
}

/**
 * Verifies a submitted code and marks it as verified. Wrong attempts are
 * counted in the database and the code is discarded once the limit is hit.
 * Returns the code record id, which is embedded in the short-lived token.
 */
export const verifyVerificationCode = async (
  input: VerifyCodeInput,
): Promise<string> => {
  if (!input.userId && !input.email) {
    throw ApiError.badRequest("A code owner is required for verification");
  }

  const record = await prisma.verificationCode.findFirst({
    where: {
      purpose: input.purpose,
      ...(input.userId ? { userId: input.userId } : { email: input.email }),
      consumedAt: null,
      expiresAt: { gt: new Date() },
      ...(input.allowVerified ? {} : { verifiedAt: null }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      codeHash: true,
      attempts: true,
      maxAttempts: true,
      verifiedAt: true,
    },
  });

  if (!record) {
    throw invalidCodeError();
  }

  if (record.attempts >= record.maxAttempts) {
    await discardVerificationCode(record.id);
    throw ApiError.badRequest(
      "Too many incorrect attempts. Please request a new code.",
    );
  }

  const matches = await comparePassword(input.code, record.codeHash);

  if (!matches) {
    const attempts = record.attempts + 1;

    if (attempts >= record.maxAttempts) {
      await discardVerificationCode(record.id);
      throw ApiError.badRequest(
        "Too many incorrect attempts. Please request a new code.",
      );
    }

    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts },
    });

    throw ApiError.badRequest("Invalid verification code.");
  }

  if (!record.verifiedAt) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { verifiedAt: new Date() },
    });
  }

  return record.id;
};

export interface ActiveVerificationCode {
  id: string;
  userId: string;
  email: string;
  expiresAt: Date;
}

/** Confirms that a token still points at a verified, unexpired, unused code. */
export const getVerifiedVerificationCode = async (input: {
  id: string;
  purpose: VerificationCodePurpose;
  userId?: string;
}): Promise<ActiveVerificationCode | null> =>
  prisma.verificationCode.findFirst({
    where: {
      id: input.id,
      purpose: input.purpose,
      ...(input.userId ? { userId: input.userId } : {}),
      verifiedAt: { not: null },
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      userId: true,
      email: true,
      expiresAt: true,
    },
  });
