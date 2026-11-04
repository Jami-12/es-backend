import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { slugify } from "../../utils/slug";
import type {
  CategoryListQuery,
  CategoryResponse,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../../types/category.types";

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  image: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.CategorySelect;

type CategoryRecord = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;

const toCategoryResponse = (category: CategoryRecord): CategoryResponse => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description,
  image: category.image,
  productCount: category._count.products,
  createdAt: category.createdAt.toISOString(),
  updatedAt: category.updatedAt.toISOString(),
});

export const listCategories = async (
  query: CategoryListQuery,
): Promise<{ items: CategoryResponse[] }> => {
  const where: Prisma.CategoryWhereInput = {};

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const categories = await prisma.category.findMany({
    where,
    select: categorySelect,
    orderBy: { name: "asc" },
  });

  return { items: categories.map(toCategoryResponse) };
};

export const getCategoryById = async (
  id: string,
): Promise<CategoryResponse> => {
  const category = await prisma.category.findUnique({
    where: { id },
    select: categorySelect,
  });

  if (!category) {
    throw ApiError.notFound("Category not found");
  }

  return toCategoryResponse(category);
};

export const createCategory = async (
  actorId: string,
  input: CreateCategoryInput,
  ipAddress?: string,
): Promise<CategoryResponse> => {
  const slug = slugify(input.slug ?? input.name);

  if (!slug) {
    throw ApiError.badRequest("Category slug is invalid");
  }

  const existing = await prisma.category.findFirst({
    where: {
      OR: [{ name: input.name.trim() }, { slug }],
    },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict("A category with this name or slug already exists");
  }

  const category = await prisma.category.create({
    data: {
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      image: input.image?.trim() || null,
    },
    select: categorySelect,
  });

  await recordAudit({
    userId: actorId,
    action: "CREATE_CATEGORY",
    entity: "Category",
    entityId: category.id,
    description: `Created category ${category.name}`,
    newData: category,
    ipAddress,
  });

  return toCategoryResponse(category);
};

export const updateCategory = async (
  actorId: string,
  categoryId: string,
  input: UpdateCategoryInput,
  ipAddress?: string,
): Promise<CategoryResponse> => {
  const existing = await prisma.category.findUnique({
    where: { id: categoryId },
    select: categorySelect,
  });

  if (!existing) {
    throw ApiError.notFound("Category not found");
  }

  const data: Prisma.CategoryUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name.trim();
  }

  if (input.slug !== undefined) {
    const slug = slugify(input.slug);

    if (!slug) {
      throw ApiError.badRequest("Category slug is invalid");
    }

    data.slug = slug;
  } else if (input.name !== undefined) {
    const slug = slugify(input.name);

    if (!slug) {
      throw ApiError.badRequest("Category name must contain letters or numbers");
    }

    data.slug = slug;
  }

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (input.image !== undefined) {
    data.image = input.image?.trim() || null;
  }

  if (data.name || data.slug) {
    const duplicate = await prisma.category.findFirst({
      where: {
        id: { not: categoryId },
        OR: [
          ...(typeof data.name === "string" ? [{ name: data.name }] : []),
          ...(typeof data.slug === "string" ? [{ slug: data.slug }] : []),
        ],
      },
      select: { id: true },
    });

    if (duplicate) {
      throw ApiError.conflict("A category with this name or slug already exists");
    }
  }

  const category = await prisma.category.update({
    where: { id: categoryId },
    data,
    select: categorySelect,
  });

  await recordAudit({
    userId: actorId,
    action: "UPDATE_CATEGORY",
    entity: "Category",
    entityId: category.id,
    description: `Updated category ${category.name}`,
    oldData: existing,
    newData: category,
    ipAddress,
  });

  return toCategoryResponse(category);
};

export const deleteCategory = async (
  actorId: string,
  categoryId: string,
  ipAddress?: string,
): Promise<void> => {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, _count: { select: { products: true } } },
  });

  if (!category) {
    throw ApiError.notFound("Category not found");
  }

  if (category._count.products > 0) {
    throw ApiError.conflict(
      `This category still contains ${category._count.products} product(s). Move or delete those products first.`,
    );
  }

  await prisma.category.delete({ where: { id: categoryId } });

  await recordAudit({
    userId: actorId,
    action: "DELETE_CATEGORY",
    entity: "Category",
    entityId: categoryId,
    description: `Deleted category ${category.name}`,
    oldData: category,
    ipAddress,
  });
};
