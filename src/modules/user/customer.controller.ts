import type { CustomerListQuery } from "../../types/user.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import * as customerService from "./customer.service";

export const listCustomers = asyncHandler(async (req, res) => {
  const result = await customerService.listCustomers(
    req.query as unknown as CustomerListQuery,
  );

  sendSuccess(res, {
    data: result,
    message: "Customers retrieved successfully",
  });
});
