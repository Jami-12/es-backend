import { DiscountType, Prisma } from "@prisma/client";
import { roundMoney, toDecimal } from "./money";

export interface ProductDiscountLike {
  discountType: DiscountType;
  discountValue: Prisma.Decimal;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}

export interface ResolvedDiscount {
  id: string | null;
  type: DiscountType;
  value: number;
  amount: number;
  startDate: string | null;
  endDate: string | null;
}

export interface ResolvedProductPricing {
  originalPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  finalPrice: Prisma.Decimal;
  discount: ResolvedDiscount | null;
}

export const isProductDiscountActive = (
  discount: ProductDiscountLike,
  at: Date = new Date(),
): boolean =>
  discount.isActive &&
  discount.startDate.getTime() <= at.getTime() &&
  discount.endDate.getTime() >= at.getTime();

export const calculateDiscountAmount = (
  price: Prisma.Decimal,
  discount: ProductDiscountLike,
  at: Date = new Date(),
): Prisma.Decimal => {
  if (!isProductDiscountActive(discount, at)) {
    return toDecimal(0);
  }

  const rawAmount =
    discount.discountType === DiscountType.PERCENTAGE
      ? (price.toNumber() * discount.discountValue.toNumber()) / 100
      : discount.discountValue.toNumber();

  return toDecimal(Math.min(Math.max(roundMoney(rawAmount), 0), price.toNumber()));
};

/**
 * Resolves the price a customer actually pays.
 *
 * An admin-controlled `discountPrice` wins when its flag is enabled and the
 * amount is genuinely lower than the regular price. Otherwise a scheduled
 * ProductDiscount campaign is used. Disabled or invalid discount prices are
 * ignored everywhere (cards, cart, checkout, orders and analytics).
 */
export const resolveProductPricing = (
  price: Prisma.Decimal,
  discount:
    | (ProductDiscountLike & {
        id: string;
      })
    | null,
  at: Date = new Date(),
  discountPrice?: Prisma.Decimal | null,
  isDiscountActive = false,
): ResolvedProductPricing => {
  if (
    isDiscountActive &&
    discountPrice &&
    discountPrice.greaterThan(0) &&
    discountPrice.lessThan(price)
  ) {
    const discountAmount = price.minus(discountPrice);

    return {
      originalPrice: price,
      discountAmount,
      finalPrice: discountPrice,
      discount: {
        id: null,
        type: DiscountType.FIXED_AMOUNT,
        value: discountPrice.toNumber(),
        amount: discountAmount.toNumber(),
        startDate: null,
        endDate: null,
      },
    };
  }

  if (discount && isProductDiscountActive(discount, at)) {
    const discountAmount = calculateDiscountAmount(price, discount, at);

    return {
      originalPrice: price,
      discountAmount,
      finalPrice: price.minus(discountAmount),
      discount: {
        id: discount.id,
        type: discount.discountType,
        value: discount.discountValue.toNumber(),
        amount: discountAmount.toNumber(),
        startDate: discount.startDate.toISOString(),
        endDate: discount.endDate.toISOString(),
      },
    };
  }

  return {
    originalPrice: price,
    discountAmount: toDecimal(0),
    finalPrice: price,
    discount: null,
  };
};
