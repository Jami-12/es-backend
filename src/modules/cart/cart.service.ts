import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { roundMoney } from "../../utils/money";
import { resolveProductPricing } from "../../utils/productPricing";
import type {
  AddCartItemInput,
  CartItemResponse,
  CartResponse,
  UpdateCartItemInput,
} from "../../types/cart.types";

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      product: {
        include: {
          images: {
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            take: 1,
          },
          discount: true,
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

const toCartResponse = (cart: CartRecord): CartResponse => {
  let subtotal = 0;
  let totalQuantity = 0;

  const items: CartItemResponse[] = cart.items.map((item) => {
    const pricing = resolveProductPricing(
      item.product.price,
      item.product.discount,
    );
    const unitPrice = pricing.finalPrice.toNumber();
    const lineTotal = roundMoney(unitPrice * item.quantity);

    subtotal = roundMoney(subtotal + lineTotal);
    totalQuantity += item.quantity;

    return {
      id: item.id,
      productId: item.productId,
      selectedSize: item.selectedSize || null,
      selectedColor: item.selectedColor || null,
      quantity: item.quantity,
      unitPrice,
      originalPrice: pricing.originalPrice.toNumber(),
      discountAmount: pricing.discountAmount.toNumber(),
      finalUnitPrice: unitPrice,
      lineTotal,
      product: {
        id: item.product.id,
        title: item.product.title,
        slug: item.product.slug,
        image: item.product.images[0]?.imageUrl ?? null,
        price: item.product.price.toNumber(),
        originalPrice: pricing.originalPrice.toNumber(),
        sellingPrice: unitPrice,
        finalPrice: unitPrice,
        discount: pricing.discount,
        stock: item.product.stock,
        status: item.product.status,
      },
    };
  });

  return {
    id: cart.id,
    userId: cart.userId,
    items,
    itemCount: items.length,
    totalQuantity,
    subtotal,
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  };
};

const getOrCreateCart = async (userId: string): Promise<CartRecord> => {
  const existing = await prisma.cart.findUnique({
    where: { userId },
    include: cartInclude,
  });

  if (existing) {
    return existing;
  }

  return prisma.cart.create({
    data: { userId },
    include: cartInclude,
  });
};

const loadCart = async (userId: string): Promise<CartRecord> => {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: cartInclude,
  });

  if (!cart) {
    throw ApiError.notFound("Cart not found");
  }

  return cart;
};

export const getCart = async (userId: string): Promise<CartResponse> => {
  const cart = await getOrCreateCart(userId);
  return toCartResponse(cart);
};

export const addCartItem = async (
  userId: string,
  input: AddCartItemInput,
): Promise<CartResponse> => {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      title: true,
      stock: true,
      status: true,
      archivedAt: true,
    },
  });

  if (!product) {
    throw ApiError.notFound("Product not found");
  }

  if (product.status !== ProductStatus.ACTIVE || product.archivedAt !== null) {
    throw ApiError.badRequest("This product is not available for purchase");
  }

  if (product.stock < input.quantity) {
    throw ApiError.conflict(
      `Insufficient stock for "${product.title}". Available: ${product.stock}`,
    );
  }

  const cart = await prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });

  const selectedSize = input.selectedSize?.trim() ?? "";
  const selectedColor = input.selectedColor?.trim() ?? "";
  const variantKey = {
    cartId: cart.id,
    productId: product.id,
    selectedSize,
    selectedColor,
  };

  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_productId_selectedSize_selectedColor: variantKey },
    select: { id: true, quantity: true },
  });

  const nextQuantity = (existingItem?.quantity ?? 0) + input.quantity;

  if (nextQuantity > product.stock) {
    throw ApiError.conflict(
      `Insufficient stock for "${product.title}". Available: ${product.stock}, requested: ${nextQuantity}`,
    );
  }

  await prisma.cartItem.upsert({
    where: { cartId_productId_selectedSize_selectedColor: variantKey },
    create: {
      ...variantKey,
      quantity: input.quantity,
    },
    update: {
      quantity: nextQuantity,
    },
  });

  return toCartResponse(await loadCart(userId));
};

export const updateCartItem = async (
  userId: string,
  itemId: string,
  input: UpdateCartItemInput,
): Promise<CartResponse> => {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: {
      cart: { select: { userId: true } },
      product: {
        select: {
          title: true,
          stock: true,
          status: true,
          archivedAt: true,
        },
      },
    },
  });

  if (!item || item.cart.userId !== userId) {
    throw ApiError.notFound("Cart item not found");
  }

  if (item.product.status !== ProductStatus.ACTIVE || item.product.archivedAt !== null) {
    throw ApiError.badRequest("This product is not available for purchase");
  }

  if (input.quantity > item.product.stock) {
    throw ApiError.conflict(
      `Insufficient stock for "${item.product.title}". Available: ${item.product.stock}`,
    );
  }

  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity: input.quantity },
  });

  return toCartResponse(await loadCart(userId));
};

export const removeCartItem = async (
  userId: string,
  itemId: string,
): Promise<CartResponse> => {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: { select: { userId: true } } },
  });

  if (!item || item.cart.userId !== userId) {
    throw ApiError.notFound("Cart item not found");
  }

  await prisma.cartItem.delete({ where: { id: itemId } });

  return toCartResponse(await loadCart(userId));
};

export const clearCart = async (userId: string): Promise<CartResponse> => {
  const cart = await prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });

  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

  return toCartResponse(await loadCart(userId));
};
