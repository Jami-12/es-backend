import { UserStatus, VerificationCodePurpose } from "@prisma/client";

import { env } from "../../config/env";
import { ensureMailConfigured, sendMail } from "../../config/mailer";
import { prisma } from "../../config/prisma";
import type {
  PasswordResetVerification,
  ResetPasswordInput,
  VerifyPasswordResetCodeInput,
} from "../../types/auth.types";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import {
  signPasswordResetToken,
  VERIFICATION_TOKEN_TTL,
  verifyPasswordResetToken,
} from "../../utils/jwt";
import { hashPassword } from "../../utils/password";
import {
  discardVerificationCode,
  getVerifiedVerificationCode,
  issueVerificationCode,
  verifyVerificationCode,
  VERIFICATION_CODE_TTL_MS,
} from "../../utils/verificationCodes";

const PURPOSE = VerificationCodePurpose.PASSWORD_RESET;
const CODE_VALIDITY_MINUTES = Math.round(VERIFICATION_CODE_TTL_MS / 60_000);

const invalidCodeError = (): ApiError =>
  ApiError.badRequest(
    "The verification code is invalid or has expired. Please request a new one.",
  );

const findResettableUser = async (email: string) =>
  prisma.user.findFirst({
    where: {
      email,
      deletedAt: null,
      status: UserStatus.ACTIVE,
      isActive: true,
    },
    select: { id: true, email: true, provider: true },
  });

/**
 * Always returns the same generic outcome to the caller. Eligible accounts
 * receive an email; unknown/ineligible accounts receive nothing.
 */
export const sendPasswordResetCode = async (email: string): Promise<void> => {
  // Check configuration before looking up the account so a missing SMTP setup
  // cannot be used to probe which email addresses are registered.
  ensureMailConfigured();

  const user = await findResettableUser(email);

  // Google-only accounts have no local password to reset.
  if (!user || user.provider === "GOOGLE") {
    return;
  }

  const issued = await issueVerificationCode({
    email: user.email,
    userId: user.id,
    purpose: PURPOSE,
  });

  try {
    await sendMail({
      to: user.email,
      subject: `${env.STORE_NAME} password reset code`,
      text:
        `Your password reset code is ${issued.code}. ` +
        `It expires in ${CODE_VALIDITY_MINUTES} minutes. ` +
        "If you did not request a password reset, you can ignore this email.",
      html:
        `<p>Your password reset code is <strong>${issued.code}</strong>.</p>` +
        `<p>This code expires in ${CODE_VALIDITY_MINUTES} minutes.</p>` +
        "<p>If you did not request a password reset, you can ignore this email.</p>",
    });
  } catch (error) {
    // Do not leave a code in the database when delivery failed.
    await discardVerificationCode(issued.id);
    throw error;
  }
};

export const verifyPasswordResetCode = async (
  input: VerifyPasswordResetCodeInput,
): Promise<PasswordResetVerification> => {
  const user = await findResettableUser(input.email);

  if (!user || user.provider === "GOOGLE") {
    throw invalidCodeError();
  }

  const codeId = await verifyVerificationCode({
    purpose: PURPOSE,
    email: user.email,
    code: input.code,
  });

  return {
    resetToken: signPasswordResetToken({
      sub: user.id,
      email: user.email,
      codeId,
    }),
    expiresIn: VERIFICATION_TOKEN_TTL,
  };
};

export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
  let userId: string;
  let email: string;
  let codeId: string;

  if (input.resetToken) {
    const payload = verifyPasswordResetToken(input.resetToken);
    userId = payload.sub;
    email = payload.email;
    codeId = payload.codeId;
  } else {
    if (!input.email || !input.code) {
      throw ApiError.badRequest(
        "Provide a reset token or an email and verification code",
      );
    }

    const user = await findResettableUser(input.email);

    if (!user || user.provider === "GOOGLE") {
      throw invalidCodeError();
    }

    userId = user.id;
    email = user.email;
    codeId = await verifyVerificationCode({
      purpose: PURPOSE,
      email,
      code: input.code,
      allowVerified: true,
    });
  }

  const verifiedCode = await getVerifiedVerificationCode({
    id: codeId,
    purpose: PURPOSE,
    userId,
  });

  if (!verifiedCode || verifiedCode.email !== email) {
    throw invalidCodeError();
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });

    // The code is single-use: remove it and any sibling reset codes.
    await tx.verificationCode.deleteMany({
      where: { email, purpose: PURPOSE },
    });

    await recordAudit(
      {
        userId,
        action: "RESET_PASSWORD",
        entity: "User",
        entityId: userId,
        description: `Reset password for ${email}`,
      },
      tx,
    );
  });
};
