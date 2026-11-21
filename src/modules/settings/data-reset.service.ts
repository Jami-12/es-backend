import { Role, UserStatus, VerificationCodePurpose } from "@prisma/client";

import { env } from "../../config/env";
import { ensureMailConfigured, sendMail } from "../../config/mailer";
import { prisma } from "../../config/prisma";
import type {
  DataResetSummary,
  DataResetVerification,
  ExecuteDataResetInput,
  VerifyDataResetCodeInput,
} from "../../types/settings.types";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import {
  signDataResetToken,
  VERIFICATION_TOKEN_TTL,
  verifyDataResetToken,
} from "../../utils/jwt";
import {
  discardVerificationCode,
  getVerifiedVerificationCode,
  issueVerificationCode,
  verifyVerificationCode,
  VERIFICATION_CODE_TTL_MS,
} from "../../utils/verificationCodes";

const PURPOSE = VerificationCodePurpose.DATA_RESET;
const CODE_VALIDITY_MINUTES = Math.round(VERIFICATION_CODE_TTL_MS / 60_000);

/**
 * The JWT role guard is not enough on its own: roles and account state may
 * have changed since the token was issued, so the current user is re-read.
 */
const assertActiveSuperAdmin = async (userId: string) => {
  const admin = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
    },
    select: { id: true, email: true },
  });

  if (!admin) {
    throw ApiError.forbidden(
      "Only an active SUPER_ADMIN account can perform a data reset",
    );
  }

  return admin;
};

export const requestDataResetCode = async (
  actorId: string,
  ipAddress?: string,
): Promise<void> => {
  const admin = await assertActiveSuperAdmin(actorId);
  ensureMailConfigured();

  const issued = await issueVerificationCode({
    email: admin.email,
    userId: admin.id,
    purpose: PURPOSE,
  });

  const requestOrigin = ipAddress ? ` Request origin: ${ipAddress}.` : "";

  try {
    await sendMail({
      to: admin.email,
      subject: `${env.STORE_NAME} data reset verification code`,
      text:
        `Your data reset verification code is ${issued.code}. ` +
        `It expires in ${CODE_VALIDITY_MINUTES} minutes.${requestOrigin} ` +
        "If you did not request a data reset, ignore this email and secure your account.",
      html:
        `<p>Your data reset verification code is <strong>${issued.code}</strong>.</p>` +
        `<p>This code expires in ${CODE_VALIDITY_MINUTES} minutes.</p>` +
        (requestOrigin ? `<p>${requestOrigin}</p>` : "") +
        "<p>If you did not request a data reset, ignore this email and secure your account.</p>",
    });
  } catch (error) {
    await discardVerificationCode(issued.id);
    throw error;
  }
};

export const verifyDataResetCode = async (
  actorId: string,
  input: VerifyDataResetCodeInput,
): Promise<DataResetVerification> => {
  const admin = await assertActiveSuperAdmin(actorId);
  const codeId = await verifyVerificationCode({
    purpose: PURPOSE,
    userId: admin.id,
    code: input.code,
  });

  return {
    verificationToken: signDataResetToken({
      sub: admin.id,
      email: admin.email,
      codeId,
    }),
    expiresIn: VERIFICATION_TOKEN_TTL,
  };
};

/**
 * Wipes store data inside a single transaction. User accounts (including all
 * admins), audit logs and the site settings singleton are deliberately kept so
 * the super admin can never be locked out and the action stays auditable.
 */
export const executeDataReset = async (
  actorId: string,
  input: ExecuteDataResetInput,
  ipAddress?: string,
): Promise<DataResetSummary> => {
  const admin = await assertActiveSuperAdmin(actorId);
  const payload = verifyDataResetToken(input.verificationToken);

  if (payload.sub !== admin.id || payload.email !== admin.email) {
    throw ApiError.forbidden(
      "This verification token was issued for a different administrator",
    );
  }

  const verifiedCode = await getVerifiedVerificationCode({
    id: payload.codeId,
    purpose: PURPOSE,
    userId: admin.id,
  });

  if (!verifiedCode || verifiedCode.email !== admin.email) {
    throw ApiError.badRequest(
      "The data reset verification is invalid or has expired. Request a new code.",
    );
  }

  const summary = await prisma.$transaction(
    async (tx) => {
      // Delete children before parents wherever foreign keys use Restrict.
      const payments = await tx.payment.deleteMany();
      const orderItems = await tx.orderItem.deleteMany();
      const orders = await tx.order.deleteMany();

      const cartItems = await tx.cartItem.deleteMany();
      const carts = await tx.cart.deleteMany();
      const wishlists = await tx.wishlist.deleteMany();
      const reviews = await tx.review.deleteMany();

      const homeCategorySections = await tx.homeCategorySection.deleteMany();
      const productDiscounts = await tx.productDiscount.deleteMany();
      const inventoryLogs = await tx.inventoryLog.deleteMany();
      const productImages = await tx.productImage.deleteMany();
      const products = await tx.product.deleteMany();
      const categories = await tx.category.deleteMany();
      const brands = await tx.brand.deleteMany();

      const banners = await tx.banner.deleteMany();
      const coupons = await tx.coupon.deleteMany();
      const addresses = await tx.address.deleteMany();
      const notifications = await tx.notification.deleteMany();

      const salaryPayments = await tx.salaryPayment.deleteMany();
      const expenses = await tx.expense.deleteMany();
      const investments = await tx.investment.deleteMany();
      const financialTransactions = await tx.financialTransaction.deleteMany();
      const employees = await tx.employee.deleteMany();

      // Remove the one-time data-reset codes after a successful wipe.
      await tx.verificationCode.deleteMany({ where: { purpose: PURPOSE } });

      const result: DataResetSummary = {
        products: products.count,
        categories: categories.count,
        brands: brands.count,
        banners: banners.count,
        coupons: coupons.count,
        orders: orders.count,
        payments: payments.count,
        reviews: reviews.count,
        carts: carts.count,
        wishlists: wishlists.count,
        notifications: notifications.count,
        addresses: addresses.count,
        financeRecords:
          salaryPayments.count +
          expenses.count +
          investments.count +
          financialTransactions.count,
        employees: employees.count,
        inventoryLogs: inventoryLogs.count,
        totalRecords:
          payments.count +
          orderItems.count +
          orders.count +
          cartItems.count +
          carts.count +
          wishlists.count +
          reviews.count +
          homeCategorySections.count +
          productDiscounts.count +
          inventoryLogs.count +
          productImages.count +
          products.count +
          categories.count +
          brands.count +
          banners.count +
          coupons.count +
          addresses.count +
          notifications.count +
          salaryPayments.count +
          expenses.count +
          investments.count +
          financialTransactions.count +
          employees.count,
      };

      await recordAudit(
        {
          userId: admin.id,
          action: "DATA_RESET",
          entity: "Store",
          entityId: "all",
          description: `Data wipe executed by ${admin.email}; ${result.totalRecords} records removed`,
          newData: result,
          ipAddress,
        },
        tx,
      );

      return result;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  return summary;
};
