import type {
  ChangePasswordInput,
  RefreshTokenInput,
} from "../../types/auth.types";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/ApiResponse";
import { getAuthUser } from "../../utils/auth";
import * as authService from "./auth.service";
import * as googleOAuthService from "./google-oauth.service";

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);

  sendSuccess(res, {
    statusCode: 201,
    data: result,
    message: "Registration successful",
  });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);

  sendSuccess(res, {
    data: result,
    message: "Login successful",
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const input = req.body as RefreshTokenInput;
  const result = await authService.refresh(input.refreshToken);

  sendSuccess(res, {
    data: result,
    message: "Token refreshed successfully",
  });
});

export const me = asyncHandler(async (req, res) => {
  const authenticatedUser = getAuthUser(req);
  const user = await authService.getProfile(authenticatedUser.id);

  sendSuccess(res, {
    data: { user },
    message: "Profile retrieved successfully",
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const authenticatedUser = getAuthUser(req);
  await authService.changePassword(
    authenticatedUser.id,
    req.body as ChangePasswordInput,
  );

  sendSuccess(res, {
    data: null,
    message: "Password changed successfully",
  });
});

export const googleLogin = asyncHandler(async (_req, res) => {
  res.redirect(googleOAuthService.buildGoogleAuthUrl());
});

export const googleCallback = asyncHandler(async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state =
    typeof req.query.state === "string" ? req.query.state : undefined;
  const oauthError =
    typeof req.query.error === "string" ? req.query.error : undefined;

  if (oauthError) {
    res.redirect(
      googleOAuthService.buildFrontendErrorUrl(
        `Google authentication was cancelled: ${oauthError}`,
      ),
    );
    return;
  }

  if (!code || !state) {
    res.redirect(
      googleOAuthService.buildFrontendErrorUrl(
        "Google callback is missing code or state",
      ),
    );
    return;
  }

  try {
    googleOAuthService.verifyState(state);
    const profile = await googleOAuthService.exchangeCodeForProfile(code);
    const result = await authService.loginWithGoogle(profile);

    res.redirect(
      googleOAuthService.buildFrontendCallbackUrl(
        result.accessToken,
        result.refreshToken,
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google authentication failed";
    res.redirect(googleOAuthService.buildFrontendErrorUrl(message));
  }
});
