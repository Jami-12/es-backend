import type {
  ExecuteDataResetInput,
  UpdateSettingsInput,
  VerifyDataResetCodeInput,
} from "../../types/settings.types";
import { sendSuccess } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAuthUser } from "../../utils/auth";
import * as dataResetService from "./data-reset.service";
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

export const requestDataResetCode = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  await dataResetService.requestDataResetCode(actor.id, req.ip);

  sendSuccess(res, {
    data: null,
    message: "A data reset verification code has been sent to your admin email.",
  });
});

export const verifyDataResetCode = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const result = await dataResetService.verifyDataResetCode(
    actor.id,
    req.body as VerifyDataResetCodeInput,
  );

  sendSuccess(res, {
    data: result,
    message: "Data reset verification code accepted",
  });
});

export const executeDataReset = asyncHandler(async (req, res) => {
  const actor = getAuthUser(req);
  const summary = await dataResetService.executeDataReset(
    actor.id,
    req.body as ExecuteDataResetInput,
    req.ip,
  );

  sendSuccess(res, {
    data: { summary },
    message: "Store data has been reset",
  });
});
