import { Prisma } from "@prisma/client";

export const toDecimal = (value: number): Prisma.Decimal =>
  new Prisma.Decimal(value.toFixed(2));

export const toNumber = (value: Prisma.Decimal | null | undefined): number =>
  value ? value.toNumber() : 0;

export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateShippingCost = (
  subtotal: number,
  flatRate: number,
  freeThreshold: number,
): number => {
  if (subtotal <= 0 || subtotal >= freeThreshold) {
    return 0;
  }

  return roundMoney(flatRate);
};

export const effectivePrice = (
  price: Prisma.Decimal,
  discountPrice: Prisma.Decimal | null,
): Prisma.Decimal => {
  if (discountPrice && discountPrice.greaterThan(0) && discountPrice.lessThan(price)) {
    return discountPrice;
  }

  return price;
};
