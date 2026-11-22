import { Prisma, type Coupon } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { roundMoney, toDecimal } from "../../utils/money";
import { resolveProductPricing } from "../../utils/productPricing";
import type {
  CouponListQuery,
  CouponResponse,
  CreateCouponInput,
  UpdateCouponInput,
  UpdateCouponStatusInput,
} from "../../types/coupon.types";

type DbClient = Prisma.TransactionClient | typeof prisma;

const toCouponResponse = (coupon: Coupon): CouponResponse => ({
  id: coupon.id,
  code: coupon.code,
  description: coupon.description,
  discountPercent: coupon.discountPercent?.toNumber() ?? null,
  discountAmount: coupon.discountAmount?.toNumber() ?? null,
  minimumAmount: coupon.minimumAmount?.toNumber() ?? null,
  maxDiscount: coupon.maxDiscount?.toNumber() ?? null,
  usageLimit: coupon.usageLimit,
  usedCount: coupon.usedCount,
  isActive: coupon.isActive,
  startDate: coupon.startDate?.toISOString() ?? null,
  endDate: coupon.endDate?.toISOString() ?? null,
  createdAt: coupon.createdAt.toISOString(),
  updatedAt: coupon.updatedAt.toISOString(),
});

const calculateDiscount = (coupon: Coupon, subtotal: number): number => {
  if (coupon.discountPercent) {
    const percentage = coupon.discountPercent.toNumber();
    let discount = roundMoney((subtotal * percentage) / 100);

    if (coupon.maxDiscount) {
      discount = Math.min(discount, coupon.maxDiscount.toNumber());
    }

    return roundMoney(Math.min(discount, subtotal));
  }

  if (coupon.discountAmount) {
    return roundMoney(Math.min(coupon.discountAmount.toNumber(), subtotal));
  }

  throw ApiError.badRequest("Coupon does not define a valid discount");
};

const assertCouponCanBeUsed = (coupon: Coupon, subtotal: number): void => {
  const now = new Date();

  if (!coupon.isActive) {
    throw ApiError.badRequest("This coupon is not active");
  }

  if (coupon.startDate && coupon.startDate > now) {
    throw ApiError.badRequest("This coupon is not valid yet");
  }

  if (coupon.endDate && coupon.endDate < now) {
    throw ApiError.badRequest("This coupon has expired");
  }

  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest("This coupon has reached its usage limit");
  }

  if (
    coupon.minimumAmount &&
    subtotal < coupon.minimumAmount.toNumber()
  ) {
    throw ApiError.badRequest(
      `This coupon requires a minimum order amount of ${coupon.minimumAmount.toFixed(2)}`,
    );
  }
};

export const resolveCoupon = async (
  code: string,
  subtotal: number,
  client: DbClient = prisma,
): Promise<{ coupon: Coupon; discountAmount: number }> => {
  const normalizedCode = code.trim().toUpperCase();

  const coupon = await client.coupon.findUnique({
    where: { code: normalizedCode },
  });

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  assertCouponCanBeUsed(coupon, subtotal);

  return {
    coupon,
    discountAmount: calculateDiscount(coupon, subtotal),
  };
};

export const listCoupons = async (
  query: CouponListQuery,
): Promise<{ items: CouponResponse[] }> => {
  const where: Prisma.CouponWhereInput = {};

  if (query.search) {
    where.OR = [
      { code: { contains: query.search.toUpperCase(), mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  if (typeof query.isActive === "boolean") {
    where.isActive = query.isActive;
  }

  const coupons = await prisma.coupon.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return { items: coupons.map(toCouponResponse) };
};

export const getCouponById = async (id: string): Promise<CouponResponse> => {
  const coupon = await prisma.coupon.findUnique({ where: { id } });

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  return toCouponResponse(coupon);
};

export const createCoupon = async (
  actorId: string,
  input: CreateCouponInput,
  ipAddress?: string,
): Promise<CouponResponse> => {
  const discountPercent = input.discountPercent ?? null;
  const discountAmount = input.discountAmount ?? null;

  if ((discountPercent === null) === (discountAmount === null)) {
    throw ApiError.badRequest(
      "Provide exactly one of discountPercent or discountAmount",
    );
  }

  const code = input.code.trim().toUpperCase();

  const existing = await prisma.coupon.findUnique({
    where: { code },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict("A coupon with this code already exists");
  }

  const startDate = input.startDate ? new Date(input.startDate) : null;
  const endDate = input.endDate ? new Date(input.endDate) : null;

  if (startDate && endDate && endDate <= startDate) {
    throw ApiError.badRequest("End date must be after start date");
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      description: input.description?.trim() || null,
      discountPercent:
        discountPercent !== null ? toDecimal(discountPercent) : null,
      discountAmount:
        discountAmount !== null ? toDecimal(discountAmount) : null,
      minimumAmount:
        input.minimumAmount !== undefined && input.minimumAmount !== null
          ? toDecimal(input.minimumAmount)
          : null,
      maxDiscount:
        input.maxDiscount !== undefined && input.maxDiscount !== null
          ? toDecimal(input.maxDiscount)
          : null,
      usageLimit: input.usageLimit ?? null,
      isActive: input.isActive ?? true,
      startDate,
      endDate,
    },
  });

  await recordAudit({
    userId: actorId,
    action: "CREATE_COUPON",
    entity: "Coupon",
    entityId: coupon.id,
    description: `Created coupon ${coupon.code}`,
    newData: coupon,
    ipAddress,
  });

  return toCouponResponse(coupon);
};

export const updateCoupon = async (
  actorId: string,
  couponId: string,
  input: UpdateCouponInput,
  ipAddress?: string,
): Promise<CouponResponse> => {
  const existing = await prisma.coupon.findUnique({ where: { id: couponId } });

  if (!existing) {
    throw ApiError.notFound("Coupon not found");
  }

  if (
    input.usageLimit !== undefined &&
    input.usageLimit !== null &&
    input.usageLimit < existing.usedCount
  ) {
    throw ApiError.badRequest(
      "Usage limit cannot be lower than the number of times this coupon has already been used",
    );
  }

  const data: Prisma.CouponUpdateInput = {};

  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase();
    const duplicate = await prisma.coupon.findFirst({
      where: { code, id: { not: couponId } },
      select: { id: true },
    });

    if (duplicate) {
      throw ApiError.conflict("A coupon with this code already exists");
    }

    data.code = code;
  }

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (input.discountPercent !== undefined) {
    data.discountPercent =
      input.discountPercent !== null
        ? toDecimal(input.discountPercent)
        : null;
  }

  if (input.discountAmount !== undefined) {
    data.discountAmount =
      input.discountAmount !== null
        ? toDecimal(input.discountAmount)
        : null;
  }

  if (input.minimumAmount !== undefined) {
    data.minimumAmount =
      input.minimumAmount !== null ? toDecimal(input.minimumAmount) : null;
  }

  if (input.maxDiscount !== undefined) {
    data.maxDiscount =
      input.maxDiscount !== null ? toDecimal(input.maxDiscount) : null;
  }

  if (input.usageLimit !== undefined) {
    data.usageLimit = input.usageLimit;
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  if (input.startDate !== undefined) {
    data.startDate = input.startDate ? new Date(input.startDate) : null;
  }

  if (input.endDate !== undefined) {
    data.endDate = input.endDate ? new Date(input.endDate) : null;
  }

  const finalPercent =
    input.discountPercent !== undefined
      ? input.discountPercent
      : existing.discountPercent?.toNumber() ?? null;
  const finalAmount =
    input.discountAmount !== undefined
      ? input.discountAmount
      : existing.discountAmount?.toNumber() ?? null;

  if (
    (finalPercent === null || finalPercent === undefined) &&
    (finalAmount === null || finalAmount === undefined)
  ) {
    throw ApiError.badRequest(
      "A coupon must define either discountPercent or discountAmount",
    );
  }

  if (
    finalPercent !== null &&
    finalPercent !== undefined &&
    finalAmount !== null &&
    finalAmount !== undefined
  ) {
    throw ApiError.badRequest(
      "A coupon cannot define both discountPercent and discountAmount",
    );
  }

  const finalStart =
    input.startDate !== undefined
      ? input.startDate
        ? new Date(input.startDate)
        : null
      : existing.startDate;
  const finalEnd =
    input.endDate !== undefined
      ? input.endDate
        ? new Date(input.endDate)
        : null
      : existing.endDate;

  if (finalStart && finalEnd && finalEnd <= finalStart) {
    throw ApiError.badRequest("End date must be after start date");
  }

  const coupon = await prisma.coupon.update({
    where: { id: couponId },
    data,
  });

  await recordAudit({
    userId: actorId,
    action: "UPDATE_COUPON",
    entity: "Coupon",
    entityId: coupon.id,
    description: `Updated coupon ${coupon.code}`,
    oldData: existing,
    newData: coupon,
    ipAddress,
  });

  return toCouponResponse(coupon);
};

export const updateCouponStatus = async (
  actorId: string,
  couponId: string,
  input: UpdateCouponStatusInput,
  ipAddress?: string,
): Promise<CouponResponse> => {
  const existing = await prisma.coupon.findUnique({ where: { id: couponId } });

  if (!existing) {
    throw ApiError.notFound("Coupon not found");
  }

  const coupon = await prisma.coupon.update({
    where: { id: couponId },
    data: { isActive: input.isActive },
  });

  await recordAudit({
    userId: actorId,
    action: input.isActive ? "ENABLE_COUPON" : "DISABLE_COUPON",
    entity: "Coupon",
    entityId: coupon.id,
    description: `${input.isActive ? "Enabled" : "Disabled"} coupon ${coupon.code}`,
    oldData: { isActive: existing.isActive },
    newData: { isActive: coupon.isActive },
    ipAddress,
  });

  return toCouponResponse(coupon);
};

export const deleteCoupon = async (
  actorId: string,
  couponId: string,
  ipAddress?: string,
): Promise<void> => {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });

  if (!coupon) {
    throw ApiError.notFound("Coupon not found");
  }

  await prisma.coupon.delete({ where: { id: couponId } });

  await recordAudit({
    userId: actorId,
    action: "DELETE_COUPON",
    entity: "Coupon",
    entityId: couponId,
    description: `Deleted coupon ${coupon.code}`,
    oldData: coupon,
    ipAddress,
  });
};

export const validateCouponForUser = async (
  userId: string,
  code: string,
  providedSubtotal?: number,
): Promise<{
  coupon: CouponResponse;
  subtotal: number;
  discountAmount: number;
  totalAfterDiscount: number;
}> => {
  let subtotal: number;

  if (providedSubtotal !== undefined) {
    subtotal = roundMoney(providedSubtotal);
  } else {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                price: true,
                discount: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw ApiError.badRequest(
        "Your cart is empty. Provide a subtotal to validate a coupon without a cart.",
      );
    }

    // Use the exact same pricing helper as the cart and checkout so coupon
    // minimums and discounts are checked against the real product subtotal.
    subtotal = roundMoney(
      cart.items.reduce((sum, item) => {
        const unitPrice = resolveProductPricing(
          item.product.price,
          item.product.discount,
        ).finalPrice.toNumber();
        return sum + unitPrice * item.quantity;
      }, 0),
    );
  }

  const { coupon, discountAmount } = await resolveCoupon(code, subtotal);

  return {
    coupon: toCouponResponse(coupon),
    subtotal,
    discountAmount,
    totalAfterDiscount: roundMoney(subtotal - discountAmount),
  };
};
