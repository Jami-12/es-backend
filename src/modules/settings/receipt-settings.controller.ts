import type { UpdateReceiptSettingsInput } from "../../types/receipt-settings.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as receiptSettingsService from "./receipt-settings.service";

export const getReceiptSettings = asyncHandler(async (_req, res) => {
  const settings = await receiptSettingsService.getReceiptSettings();

  sendSuccess(res, {
    data: { settings },
    message: "Receipt settings retrieved successfully",
  });
});

export const updateReceiptSettings = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const settings = await receiptSettingsService.updateReceiptSettings(
    actor.id,
    req.body as UpdateReceiptSettingsInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { settings },
    message: "Receipt settings updated successfully",
  });
});
