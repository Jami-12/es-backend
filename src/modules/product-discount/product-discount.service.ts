import { DiscountType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { toDecimal } from "../../utils/money";
import { calculateDiscountAmount } from "../../utils/productPricing";
import type {
  ProductDiscountDetailResponse,
  ProductDiscountInput,
  UpdateProductDiscountInput,
} from "../../types/product.types";

const productSelect = {
  id: true,
  title: true,
  price: true,
} satisfies Prisma.ProductSelect;

const discountInclude = {
  product: { select: productSelect },
} satisfies Prisma.ProductDiscountInclude;

type DiscountRecord = Prisma.ProductDiscountGetPayload<{
  include: typeof discountInclude;
}>;

const getDiscountStatus = (
  discount: DiscountRecord,
  now: Date,
): ProductDiscountDetailResponse["status"] => {
  if (!discount.isActive) {
    return "INACTIVE";
  }

  if (discount.startDate.getTime() > now.getTime()) {
    return "SCHEDULED";
  }

  if (discount.endDate.getTime() < now.getTime()) {
    return "EXPIRED";
  }

  return "ACTIVE";
};

const toDiscountResponse = (
  discount: DiscountRecord,
  now: Date = new Date(),
): ProductDiscountDetailResponse => {
  const status = getDiscountStatus(discount, now);
  const price = discount.product.price;
  const amount =
    status === "ACTIVE"
      ? calculateDiscountAmount(price, discount, now)
      : toDecimal(0);

  return {
    id: discount.id,
    productId: discount.productId,
    productName: discount.product.title,
    discountType: discount.discountType,
    discountValue: discount.discountValue.toNumber(),
    startDate: discount.startDate.toISOString(),
    endDate: discount.endDate.toISOString(),
    isActive: discount.isActive,
    status,
    amount: amount.toNumber(),
    originalPrice: price.toNumber(),
    finalPrice: price.minus(amount).toNumber(),
    createdById: discount.createdById,
    createdAt: discount.createdAt.toISOString(),
    updatedAt: discount.updatedAt.toISOString(),
  };
};

const assertDiscountValueFitsPrice = (
  price: Prisma.Decimal,
  discountType: DiscountType,
  discountValue: number,
): void => {
  if (discountType === DiscountType.PERCENTAGE) {
    if (discountValue <= 0 || discountValue > 100) {
      throw ApiError.badRequest(
        "Percentage discount must be greater than 0 and at most 100",
      );
    }

    return;
  }

  if (discountValue < 0) {
    throw ApiError.badRequest("Discount value cannot be negative");
  }

  if (toDecimal(discountValue).greaterThan(price)) {
    throw ApiError.badRequest(
      "Fixed discount cannot be greater than the product price",
    );
  }
};

const assertDateRange = (startDate: Date, endDate: Date): void => {
  if (endDate.getTime() <= startDate.getTime()) {
    throw ApiError.badRequest("End date must be after the start date");
  }
};

export const getProductDiscount = async (
  productId: string,
): Promise<ProductDiscountDetailResponse | null> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  const discount = await prisma.productDiscount.findUnique({
    where: { productId },
    include: discountInclude,
  });

  return discount ? toDiscountResponse(discount) : null;
};

export const createProductDiscount = async (
  actorId: string,
  productId: string,
  input: ProductDiscountInput,
  ipAddress?: string,
): Promise<ProductDiscountDetailResponse> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      price: true,
      archivedAt: true,
      discount: { select: { id: true } },
    },
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  if (product.archivedAt) {
    throw ApiError.conflict("Archived products cannot receive a new discount");
  }

  if (product.discount) {
    throw ApiError.conflict(
      "This product already has a discount. Update or remove it instead.",
    );
  }

  const startDate = input.startDate ?? new Date();

  assertDateRange(startDate, input.endDate);
  assertDiscountValueFitsPrice(
    product.price,
    input.discountType,
    input.discountValue,
  );

  const discount = await prisma.productDiscount.create({
    data: {
      productId,
      discountType: input.discountType,
      discountValue: toDecimal(input.discountValue),
      startDate,
      endDate: input.endDate,
      isActive: input.isActive ?? true,
      createdById: actorId,
    },
    include: discountInclude,
  });

  await recordAudit({
    userId: actorId,
    action: "CREATE_PRODUCT_DISCOUNT",
    entity: "ProductDiscount",
    entityId: discount.id,
    description: `Created discount for product ${discount.product.title}`,
    newData: discount,
    ipAddress,
  });

  return toDiscountResponse(discount);
};

export const updateProductDiscount = async (
  actorId: string,
  productId: string,
  input: UpdateProductDiscountInput,
  ipAddress?: string,
): Promise<ProductDiscountDetailResponse> => {
  const existing = await prisma.productDiscount.findUnique({
    where: { productId },
    include: discountInclude,
  });

  if (!existing) {
    throw ApiError.notFound("Product discount not found");
  }

  const discountType = input.discountType ?? existing.discountType;
  const discountValue =
    input.discountValue ?? existing.discountValue.toNumber();
  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;

  assertDateRange(startDate, endDate);
  assertDiscountValueFitsPrice(
    existing.product.price,
    discountType,
    discountValue,
  );

  const discount = await prisma.productDiscount.update({
    where: { id: existing.id },
    data: {
      ...(input.discountType !== undefined && {
        discountType: input.discountType,
      }),
      ...(input.discountValue !== undefined && {
        discountValue: toDecimal(input.discountValue),
      }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: discountInclude,
  });

  await recordAudit({
    userId: actorId,
    action: "UPDATE_PRODUCT_DISCOUNT",
    entity: "ProductDiscount",
    entityId: discount.id,
    description: `Updated discount for product ${discount.product.title}`,
    oldData: existing,
    newData: discount,
    ipAddress,
  });

  return toDiscountResponse(discount);
};

export const deleteProductDiscount = async (
  actorId: string,
  productId: string,
  ipAddress?: string,
): Promise<void> => {
  const discount = await prisma.productDiscount.findUnique({
    where: { productId },
    include: discountInclude,
  });

  if (!discount) {
    throw ApiError.notFound("Product discount not found");
  }

  await prisma.productDiscount.delete({ where: { id: discount.id } });

  await recordAudit({
    userId: actorId,
    action: "DELETE_PRODUCT_DISCOUNT",
    entity: "ProductDiscount",
    entityId: discount.id,
    description: `Removed discount for product ${discount.product.title}`,
    oldData: discount,
    ipAddress,
  });
};

