import { Prisma, type Address } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import type {
  AddressResponse,
  CreateAddressInput,
  UpdateAddressInput,
} from "../../types/address.types";

const toAddressResponse = (address: Address): AddressResponse => ({
  id: address.id,
  userId: address.userId,
  fullName: address.fullName,
  phone: address.phone,
  division: address.division,
  district: address.district,
  area: address.area,
  addressLine: address.addressLine,
  postalCode: address.postalCode,
  isDefault: address.isDefault,
  createdAt: address.createdAt.toISOString(),
  updatedAt: address.updatedAt.toISOString(),
});

export const listAddresses = async (
  userId: string,
): Promise<{ items: AddressResponse[] }> => {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  return { items: addresses.map(toAddressResponse) };
};

export const createAddress = async (
  userId: string,
  input: CreateAddressInput,
): Promise<AddressResponse> => {
  const addressCount = await prisma.address.count({ where: { userId } });
  const shouldBeDefault = input.isDefault === true || addressCount === 0;

  const address = await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return tx.address.create({
      data: {
        userId,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        division: input.division?.trim() || null,
        district: input.district.trim(),
        area: input.area?.trim() || null,
        addressLine: input.addressLine.trim(),
        postalCode: input.postalCode?.trim() || null,
        isDefault: shouldBeDefault,
      },
    });
  });

  return toAddressResponse(address);
};

export const updateAddress = async (
  userId: string,
  addressId: string,
  input: UpdateAddressInput,
): Promise<AddressResponse> => {
  const existing = await prisma.address.findUnique({
    where: { id: addressId },
  });

  if (!existing || existing.userId !== userId) {
    throw ApiError.notFound("Address not found");
  }

  const data: Prisma.AddressUpdateInput = {};

  if (input.fullName !== undefined) data.fullName = input.fullName.trim();
  if (input.phone !== undefined) data.phone = input.phone.trim();
  if (input.division !== undefined) {
    data.division = input.division?.trim() || null;
  }
  if (input.district !== undefined) data.district = input.district.trim();
  if (input.area !== undefined) data.area = input.area?.trim() || null;
  if (input.addressLine !== undefined) {
    data.addressLine = input.addressLine.trim();
  }
  if (input.postalCode !== undefined) {
    data.postalCode = input.postalCode?.trim() || null;
  }
  if (input.isDefault !== undefined) data.isDefault = input.isDefault;

  const address = await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.address.updateMany({
        where: { userId, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    return tx.address.update({
      where: { id: addressId },
      data,
    });
  });

  return toAddressResponse(address);
};

export const deleteAddress = async (
  userId: string,
  addressId: string,
): Promise<void> => {
  const existing = await prisma.address.findUnique({
    where: { id: addressId },
    select: {
      id: true,
      userId: true,
      isDefault: true,
      _count: { select: { orders: true } },
    },
  });

  if (!existing || existing.userId !== userId) {
    throw ApiError.notFound("Address not found");
  }

  if (existing._count.orders > 0) {
    throw ApiError.conflict(
      "This address is linked to existing orders and cannot be deleted because order history must be preserved",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: addressId } });

    if (existing.isDefault) {
      const nextAddress = await tx.address.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

      if (nextAddress) {
        await tx.address.update({
          where: { id: nextAddress.id },
          data: { isDefault: true },
        });
      }
    }
  });
};
