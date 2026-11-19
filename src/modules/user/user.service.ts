import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { recordAudit } from "../../utils/audit";
import { hashPassword } from "../../utils/password";
import { buildPaginationMeta } from "../../utils/pagination";
import type {
  CreateAdminInput,
  PaginatedUsers,
  UpdateSelfProfileInput,
  UpdateUserInput,
  UpdateUserRoleInput,
  UpdateUserStatusInput,
  UserListQuery,
  UserResponse,
} from "../../types/user.types";

const userWithCountSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  role: true,
  status: true,
  provider: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      orders: true,
    },
  },
} satisfies Prisma.UserSelect;

type UserWithCount = Prisma.UserGetPayload<{
  select: typeof userWithCountSelect;
}>;

const toUserResponse = (user: UserWithCount): UserResponse => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  image: user.image,
  role: user.role,
  status: user.status,
  provider: user.provider,
  isActive: user.isActive,
  deletedAt: user.deletedAt?.toISOString() ?? null,
  orderCount: user._count.orders,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

const auditUserData = (user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  role: Role;
  status: UserStatus;
  isActive: boolean;
  deletedAt: Date | null;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  image: user.image,
  role: user.role,
  status: user.status,
  isActive: user.isActive,
  deletedAt: user.deletedAt?.toISOString() ?? null,
});

export const listUsers = async (
  query: UserListQuery,
): Promise<PaginatedUsers> => {
  const where: Prisma.UserWhereInput = {};

  if (!query.includeDeleted) {
    where.deletedAt = null;
  }

  if (query.role) {
    where.role = query.role;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  if (query.name) {
    where.name = { contains: query.name, mode: "insensitive" };
  }

  if (query.email) {
    where.email = { contains: query.email, mode: "insensitive" };
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userWithCountSelect,
      orderBy: { createdAt: query.sortOrder },
      skip,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: users.map(toUserResponse),
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
};

export const getUserById = async (userId: string): Promise<UserResponse> => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: userWithCountSelect,
  });

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  return toUserResponse(user);
};

export const getSelfProfile = async (userId: string): Promise<UserResponse> => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: userWithCountSelect,
  });

  if (!user) {
    throw ApiError.notFound("User account not found");
  }

  return toUserResponse(user);
};

export const createAdmin = async (
  actorId: string,
  input: CreateAdminInput,
  ipAddress?: string,
): Promise<UserResponse> => {
  const email = input.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw ApiError.conflict("An account with this email already exists");
  }

  const hashedPassword = await hashPassword(input.password);

  const admin = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      password: hashedPassword,
      phone: input.phone?.trim() || null,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
    },
    select: userWithCountSelect,
  });

  await recordAudit({
    userId: actorId,
    action: "CREATE_ADMIN",
    entity: "User",
    entityId: admin.id,
    description: `Created admin account ${admin.email}`,
    newData: auditUserData(admin),
    ipAddress,
  });

  return toUserResponse(admin);
};

export const updateUser = async (
  actorId: string,
  userId: string,
  input: UpdateUserInput,
  ipAddress?: string,
): Promise<UserResponse> => {
  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: userWithCountSelect,
  });

  if (!target) {
    throw ApiError.notFound("User not found");
  }

  const email = input.email?.trim().toLowerCase();

  if (email && email !== target.email) {
    const duplicate = await prisma.user.findFirst({
      where: { email, id: { not: userId } },
      select: { id: true },
    });

    if (duplicate) {
      throw ApiError.conflict("An account with this email already exists");
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(email !== undefined && { email }),
      ...(input.phone !== undefined && {
        phone: input.phone?.trim() || null,
      }),
      ...(input.image !== undefined && {
        image: input.image?.trim() || null,
      }),
    },
    select: userWithCountSelect,
  });

  await recordAudit({
    userId: actorId,
    action: "UPDATE_USER",
    entity: "User",
    entityId: updatedUser.id,
    description: `Updated user account ${updatedUser.email}`,
    oldData: auditUserData(target),
    newData: auditUserData(updatedUser),
    ipAddress,
  });

  return toUserResponse(updatedUser);
};

export const updateSelfProfile = async (
  userId: string,
  input: UpdateSelfProfileInput,
  ipAddress?: string,
): Promise<UserResponse> => {
  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: userWithCountSelect,
  });

  if (!target) {
    throw ApiError.notFound("User account not found");
  }

  const email = input.email?.trim().toLowerCase();

  if (email && email !== target.email) {
    const duplicate = await prisma.user.findFirst({
      where: { email, id: { not: userId } },
      select: { id: true },
    });

    if (duplicate) {
      throw ApiError.conflict("An account with this email already exists");
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(email !== undefined && { email }),
      ...(input.phone !== undefined && {
        phone: input.phone?.trim() || null,
      }),
      ...(input.image !== undefined && {
        image: input.image?.trim() || null,
      }),
    },
    select: userWithCountSelect,
  });

  await recordAudit({
    userId,
    action: "UPDATE_PROFILE",
    entity: "User",
    entityId: userId,
    description: "Updated own profile",
    oldData: auditUserData(target),
    newData: auditUserData(updatedUser),
    ipAddress,
  });

  return toUserResponse(updatedUser);
};

export const updateUserRole = async (
  actorId: string,
  userId: string,
  input: UpdateUserRoleInput,
  ipAddress?: string,
): Promise<UserResponse> => {
  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: userWithCountSelect,
  });

  if (!target) {
    throw ApiError.notFound("User not found");
  }

  if (target.id === actorId) {
    throw ApiError.badRequest("You cannot change your own role");
  }

  if (target.role === Role.SUPER_ADMIN) {
    throw ApiError.forbidden(
      "SUPER_ADMIN accounts cannot be modified through this endpoint",
    );
  }

  if (input.role === Role.SUPER_ADMIN) {
    throw ApiError.forbidden(
      "SUPER_ADMIN roles cannot be assigned through this endpoint",
    );
  }

  if (target.role === input.role) {
    return toUserResponse(target);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role: input.role },
    select: userWithCountSelect,
  });

  await recordAudit({
    userId: actorId,
    action: "USER_ROLE_UPDATED",
    entity: "User",
    entityId: updatedUser.id,
    description: `Changed role for ${updatedUser.email} from ${target.role} to ${input.role}`,
    oldData: {
      previousRole: target.role,
      targetUserId: target.id,
      performedById: actorId,
    },
    newData: {
      newRole: input.role,
      targetUserId: target.id,
      performedById: actorId,
    },
    ipAddress,
  });

  await prisma.notification.create({
    data: {
      userId: updatedUser.id,
      title: "Account role updated",
      message: `Your account role has been changed to ${input.role}.`,
      type: "ACCOUNT",
    },
  });

  return toUserResponse(updatedUser);
};

export const updateUserStatus = async (
  actorId: string,
  userId: string,
  input: UpdateUserStatusInput,
  ipAddress?: string,
): Promise<UserResponse> => {
  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: userWithCountSelect,
  });

  if (!target) {
    throw ApiError.notFound("User not found");
  }

  if (target.id === actorId) {
    throw ApiError.badRequest("You cannot change your own account status");
  }

  const nextStatus =
    input.status ??
    (input.isActive === true ? UserStatus.ACTIVE : UserStatus.INACTIVE);

  if (
    target.role === Role.SUPER_ADMIN &&
    nextStatus !== UserStatus.ACTIVE
  ) {
    const activeSuperAdmins = await prisma.user.count({
      where: {
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        deletedAt: null,
      },
    });

    if (activeSuperAdmins <= 1) {
      throw ApiError.conflict(
        "The last active SUPER_ADMIN cannot be blocked or deactivated",
      );
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      status: nextStatus,
      isActive: nextStatus === UserStatus.ACTIVE,
    },
    select: userWithCountSelect,
  });

  await recordAudit({
    userId: actorId,
    action:
      nextStatus === UserStatus.BLOCKED ? "BLOCK_USER" : "USER_STATUS_UPDATED",
    entity: "User",
    entityId: updatedUser.id,
    description: `Changed status for ${updatedUser.email} from ${target.status} to ${nextStatus}`,
    oldData: { status: target.status, isActive: target.isActive },
    newData: { status: nextStatus, isActive: updatedUser.isActive },
    ipAddress,
  });

  return toUserResponse(updatedUser);
};

export const deleteUser = async (
  actorId: string,
  userId: string,
  ipAddress?: string,
): Promise<void> => {
  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      role: true,
      status: true,
      isActive: true,
      deletedAt: true,
      _count: { select: { orders: true, auditLogs: true } },
    },
  });

  if (!target) {
    throw ApiError.notFound("User not found");
  }

  if (target.id === actorId) {
    throw ApiError.badRequest("You cannot delete your own account");
  }

  if (target.role === Role.SUPER_ADMIN) {
    throw ApiError.forbidden(
      "SUPER_ADMIN accounts cannot be deleted through this endpoint",
    );
  }

  const deletedAt = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt,
      status: UserStatus.INACTIVE,
      isActive: false,
    },
  });

  await recordAudit({
    userId: actorId,
    action: "DELETE_USER",
    entity: "User",
    entityId: userId,
    description: `Soft-deleted user ${target.email}`,
    oldData: auditUserData(target),
    newData: {
      id: target.id,
      email: target.email,
      deletedAt: deletedAt.toISOString(),
      status: UserStatus.INACTIVE,
      isActive: false,
      orderCount: target._count.orders,
      auditLogCount: target._count.auditLogs,
    },
    ipAddress,
  });
};
