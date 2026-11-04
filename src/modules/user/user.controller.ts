import type {
  CreateAdminInput,
  UpdateSelfProfileInput,
  UpdateUserInput,
  UpdateUserRoleInput,
  UpdateUserStatusInput,
  UserListQuery,
} from "../../types/user.types";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/ApiResponse";
import { getAuthUser } from "../../utils/auth";
import * as userService from "./user.service";

export const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(
    req.query as unknown as UserListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Users retrieved successfully",
  });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);

  sendSuccess(res, {
    data: { user },
    message: "User retrieved successfully",
  });
});

export const getSelfProfile = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const user = await userService.getSelfProfile(actor.id);

  sendSuccess(res, {
    data: { user },
    message: "Profile retrieved successfully",
  });
});

export const updateSelfProfile = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const user = await userService.updateSelfProfile(
    actor.id,
    req.body as UpdateSelfProfileInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { user },
    message: "Profile updated successfully",
  });
});

export const updateUser = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const user = await userService.updateUser(
    actor.id,
    req.params.id,
    req.body as UpdateUserInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { user },
    message: "User updated successfully",
  });
});

export const createAdmin = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const admin = await userService.createAdmin(
    actor.id,
    req.body as CreateAdminInput,
    req.ip,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { user: admin },
    message: "Admin account created successfully",
  });
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const user = await userService.updateUserRole(
    actor.id,
    req.params.id,
    req.body as UpdateUserRoleInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { user },
    message: "User role updated successfully",
  });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const user = await userService.updateUserStatus(
    actor.id,
    req.params.id,
    req.body as UpdateUserStatusInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { user },
    message: "User status updated successfully",
  });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  await userService.deleteUser(actor.id, req.params.id, req.ip);

  sendSuccess(res, {
    data: { id: req.params.id },
    message: "User deleted successfully",
  });
});
