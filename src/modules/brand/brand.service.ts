import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { slugify } from "../../utils/slug";
import type {
  BrandListQuery,
  BrandResponse,
  CreateBrandInput,
  UpdateBrandInput,
  UpdateBrandStatusInput,
} from "../../types/brand.types";

const brandSelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.BrandSelect;

type BrandRecord = Prisma.BrandGetPayload<{ select: typeof brandSelect }>;

const toBrandResponse = (brand: BrandRecord): BrandResponse => ({
  id: brand.id,
  name: brand.name,
  slug: brand.slug,
  logo: brand.logo,
  description: brand.description,
  isActive: brand.isActive,
  productCount: brand._count.products,
  createdAt: brand.createdAt.toISOString(),
  updatedAt: brand.updatedAt.toISOString(),
});

export const listBrands = async (
  query: BrandListQuery,
): Promise<{ items: BrandResponse[] }> => {
  const where: Prisma.BrandWhereInput = {};

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  if (typeof query.isActive === "boolean") {
    where.isActive = query.isActive;
  }

  const brands = await prisma.brand.findMany({
    where,
    select: brandSelect,
    orderBy: { name: "asc" },
  });

  return { items: brands.map(toBrandResponse) };
};

export const getBrandById = async (id: string): Promise<BrandResponse> => {
  const brand = await prisma.brand.findUnique({
    where: { id },
    select: brandSelect,
  });

  if (!brand) {
    throw ApiError.notFound("Brand not found");
  }

  return toBrandResponse(brand);
};

export const createBrand = async (
  actorId: string,
  input: CreateBrandInput,
  ipAddress?: string,
): Promise<BrandResponse> => {
  const slug = slugify(input.slug ?? input.name);

  if (!slug) {
    throw ApiError.badRequest("Brand slug is invalid");
  }

  const existing = await prisma.brand.findFirst({
    where: { OR: [{ name: input.name.trim() }, { slug }] },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict("A brand with this name or slug already exists");
  }

  const brand = await prisma.brand.create({
    data: {
      name: input.name.trim(),
      slug,
      logo: input.logo?.trim() || null,
      description: input.description?.trim() || null,
      isActive: input.isActive ?? true,
    },
    select: brandSelect,
  });

  await recordAudit({
    userId: actorId,
    action: "CREATE_BRAND",
    entity: "Brand",
    entityId: brand.id,
    description: `Created brand ${brand.name}`,
    newData: brand,
    ipAddress,
  });

  return toBrandResponse(brand);
};

export const updateBrand = async (
  actorId: string,
  brandId: string,
  input: UpdateBrandInput,
  ipAddress?: string,
): Promise<BrandResponse> => {
  const existing = await prisma.brand.findUnique({
    where: { id: brandId },
    select: brandSelect,
  });

  if (!existing) {
    throw ApiError.notFound("Brand not found");
  }

  const data: Prisma.BrandUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name.trim();
  }

  if (input.slug !== undefined) {
    const slug = slugify(input.slug);

    if (!slug) {
      throw ApiError.badRequest("Brand slug is invalid");
    }

    data.slug = slug;
  } else if (input.name !== undefined) {
    const slug = slugify(input.name);

    if (!slug) {
      throw ApiError.badRequest("Brand name must contain letters or numbers");
    }

    data.slug = slug;
  }

  if (input.logo !== undefined) {
    data.logo = input.logo?.trim() || null;
  }

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  if (data.name || data.slug) {
    const duplicate = await prisma.brand.findFirst({
      where: {
        id: { not: brandId },
        OR: [
          ...(typeof data.name === "string" ? [{ name: data.name }] : []),
          ...(typeof data.slug === "string" ? [{ slug: data.slug }] : []),
        ],
      },
      select: { id: true },
    });

    if (duplicate) {
      throw ApiError.conflict("A brand with this name or slug already exists");
    }
  }

  const brand = await prisma.brand.update({
    where: { id: brandId },
    data,
    select: brandSelect,
  });

  await recordAudit({
    userId: actorId,
    action: "UPDATE_BRAND",
    entity: "Brand",
    entityId: brand.id,
    description: `Updated brand ${brand.name}`,
    oldData: existing,
    newData: brand,
    ipAddress,
  });

  return toBrandResponse(brand);
};

export const updateBrandStatus = async (
  actorId: string,
  brandId: string,
  input: UpdateBrandStatusInput,
  ipAddress?: string,
): Promise<BrandResponse> => {
  const existing = await prisma.brand.findUnique({
    where: { id: brandId },
    select: brandSelect,
  });

  if (!existing) {
    throw ApiError.notFound("Brand not found");
  }

  const brand = await prisma.brand.update({
    where: { id: brandId },
    data: { isActive: input.isActive },
    select: brandSelect,
  });

  await recordAudit({
    userId: actorId,
    action: input.isActive ? "ENABLE_BRAND" : "DISABLE_BRAND",
    entity: "Brand",
    entityId: brand.id,
    description: `${input.isActive ? "Enabled" : "Disabled"} brand ${brand.name}`,
    oldData: { isActive: existing.isActive },
    newData: { isActive: brand.isActive },
    ipAddress,
  });

  return toBrandResponse(brand);
};

export const deleteBrand = async (
  actorId: string,
  brandId: string,
  ipAddress?: string,
): Promise<void> => {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, name: true, _count: { select: { products: true } } },
  });

  if (!brand) {
    throw ApiError.notFound("Brand not found");
  }

  if (brand._count.products > 0) {
    throw ApiError.conflict(
      `This brand is still linked to ${brand._count.products} product(s). Move or delete those products first.`,
    );
  }

  await prisma.brand.delete({ where: { id: brandId } });

  await recordAudit({
    userId: actorId,
    action: "DELETE_BRAND",
    entity: "Brand",
    entityId: brandId,
    description: `Deleted brand ${brand.name}`,
    oldData: brand,
    ipAddress,
  });
};
