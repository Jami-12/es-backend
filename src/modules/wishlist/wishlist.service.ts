import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type { WishlistItemResponse } from "../../types/wishlist.types";

const wishlistInclude = {
  product: {
    include: {
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
      },
    },
  },
} satisfies Prisma.WishlistInclude;

type WishlistRecord = Prisma.WishlistGetPayload<{
  include: typeof wishlistInclude;
}>;

const toWishlistItem = (item: WishlistRecord): WishlistItemResponse => ({
  id: item.id,
  productId: item.productId,
  createdAt: item.createdAt.toISOString(),
  product: {
    id: item.product.id,
    title: item.product.title,
    slug: item.product.slug,
    image: item.product.images[0]?.imageUrl ?? null,
    price: item.product.price.toNumber(),
    discountPrice: item.product.discountPrice?.toNumber() ?? null,
    stock: item.product.stock,
    status: item.product.status,
  },
});

export const listWishlist = async (
  userId: string,
): Promise<{ items: WishlistItemResponse[] }> => {
  const items = await prisma.wishlist.findMany({
    where: { userId },
    include: wishlistInclude,
    orderBy: { createdAt: "desc" },
  });

  return { items: items.map(toWishlistItem) };
};

export const addToWishlist = async (
  userId: string,
  productId: string,
): Promise<WishlistItemResponse> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true },
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  if (product.status !== ProductStatus.ACTIVE) {
    throw ApiError.badRequest("Only active products can be added to the wishlist");
  }

  const existing = await prisma.wishlist.findUnique({
    where: {
      userId_productId: { userId, productId },
    },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict("This product is already in your wishlist");
  }

  const item = await prisma.wishlist.create({
    data: { userId, productId },
    include: wishlistInclude,
  });

  return toWishlistItem(item);
};

export const removeFromWishlist = async (
  userId: string,
  productId: string,
): Promise<void> => {
  const item = await prisma.wishlist.findUnique({
    where: {
      userId_productId: { userId, productId },
    },
    select: { id: true },
  });

  if (!item) {
    throw ApiError.notFound("This product is not in your wishlist");
  }

  await prisma.wishlist.delete({ where: { id: item.id } });
};
