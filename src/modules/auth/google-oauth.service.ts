import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import {
  getFrontendOrigin,
  getGoogleCallbackUrl,
  getGoogleSuccessRedirectUrl,
  isSafeFrontendOrigin,
} from "../../config/origins";
import { ApiError } from "../../utils/ApiError";
import jwt from "../../utils/jsonwebtoken";
import type { GoogleProfile } from "./auth.service";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_ISSUER = "ecommerce-3d-api";
const STATE_AUDIENCE = "google-oauth";
const STATE_TTL = "10m";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const requireGoogleConfig = (): { clientId: string; clientSecret: string } => {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new ApiError(
      503,
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }

  return { clientId, clientSecret };
};

interface GoogleOAuthState {
  nonce: string;
  /** Storefront that started the login, carried through Google's redirect. */
  frontendOrigin?: string;
}

const createState = (frontendOrigin?: string): string => {
  const payload: GoogleOAuthState = { nonce: randomUUID() };

  if (isSafeFrontendOrigin(frontendOrigin)) {
    payload.frontendOrigin = frontendOrigin;
  }

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: STATE_TTL,
    issuer: STATE_ISSUER,
    audience: STATE_AUDIENCE,
  });
};

/**
 * Reads the storefront hint from an unverified state token. The value is only
 * used after `isSafeFrontendOrigin` validation, so it cannot redirect users to
 * an arbitrary host even if the token was tampered with.
 */
export const getStateFrontendOrigin = (
  state: string | undefined,
): string | undefined => {
  if (!state) {
    return undefined;
  }

  const decoded = jwt.decode(state);

  if (!decoded || typeof decoded === "string") {
    return undefined;
  }

  const value = (decoded as Record<string, unknown>).frontendOrigin;

  return typeof value === "string" && isSafeFrontendOrigin(value)
    ? value
    : undefined;
};

export const verifyState = (state: string): GoogleOAuthState => {
  try {
    const payload = jwt.verify(state, env.JWT_ACCESS_SECRET, {
      issuer: STATE_ISSUER,
      audience: STATE_AUDIENCE,
    });

    if (!payload || typeof payload === "string") {
      throw new Error("Invalid state payload");
    }

    const decoded = payload as Record<string, unknown>;
    const nonce = decoded.nonce;

    if (typeof nonce !== "string" || nonce.length === 0) {
      throw new Error("Invalid state payload");
    }

    const frontendOrigin = decoded.frontendOrigin;

    return {
      nonce,
      ...(typeof frontendOrigin === "string" &&
      isSafeFrontendOrigin(frontendOrigin)
        ? { frontendOrigin }
        : {}),
    };
  } catch {
    throw ApiError.badRequest("Invalid or expired Google OAuth state");
  }
};

export const buildGoogleAuthUrl = (): string => {
  const { clientId } = requireGoogleConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    state: createState(getFrontendOrigin()),
    access_type: "online",
    prompt: "select_account",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export const exchangeCodeForProfile = async (
  code: string,
): Promise<GoogleProfile> => {
  const { clientId, clientSecret } = requireGoogleConfig();

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleCallbackUrl(),
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new ApiError(
      502,
      tokenData.error_description ??
        "Google token exchange failed. Please try again.",
    );
  }

  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

  if (!userInfoResponse.ok || !userInfo.sub || !userInfo.email) {
    throw new ApiError(502, "Google did not return a valid user profile");
  }

  return {
    googleId: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name ?? userInfo.email.split("@")[0],
    image: userInfo.picture,
    emailVerified: Boolean(userInfo.email_verified),
  };
};

export const buildFrontendCallbackUrl = (
  accessToken: string,
  refreshToken: string,
  frontendOrigin?: string,
): string => {
  const base = getGoogleSuccessRedirectUrl(frontendOrigin);
  const separator = base.includes("?") ? "&" : "?";
  const params = new URLSearchParams({ accessToken, refreshToken });

  return `${base}${separator}${params.toString()}`;
};

export const buildFrontendErrorUrl = (
  message: string,
  frontendOrigin?: string,
): string => {
  const base = getGoogleSuccessRedirectUrl(frontendOrigin);
  const separator = base.includes("?") ? "&" : "?";
  const params = new URLSearchParams({ error: message });

  return `${base}${separator}${params.toString()}`;
};
