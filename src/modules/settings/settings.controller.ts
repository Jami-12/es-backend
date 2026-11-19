import type { UpdateSettingsInput } from "../../types/settings.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as settingsService from "./settings.service";

export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await settingsService.getSettings();

  sendSuccess(res, {
    data: { settings },
    message: "Store settings retrieved successfully",
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const settings = await settingsService.updateSettings(
    actor.id,
    req.body as UpdateSettingsInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { settings },
    message: "Store settings updated successfully",
  });
});
