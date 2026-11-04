import type {
  CreateAddressInput,
  UpdateAddressInput,
} from "../../types/address.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as addressService from "./address.service";

export const listAddresses = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await addressService.listAddresses(user.id);

  sendSuccess(res, {
    data: result,
    message: "Addresses retrieved successfully",
  });
});

export const createAddress = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const address = await addressService.createAddress(
    user.id,
    req.body as CreateAddressInput,
  );

  sendSuccess(res, {
    statusCode: 201,
    data: { address },
    message: "Address created successfully",
  });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const address = await addressService.updateAddress(
    user.id,
    req.params.id,
    req.body as UpdateAddressInput,
  );

  sendSuccess(res, {
    data: { address },
    message: "Address updated successfully",
  });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  await addressService.deleteAddress(user.id, req.params.id);

  sendSuccess(res, {
    data: { id: req.params.id },
    message: "Address deleted successfully",
  });
});
