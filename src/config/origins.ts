import { configuredEnv, env } from "./env";
import { getRequestOriginHints } from "./request-context";

/**
 * Central URL resolution for callbacks, redirects, CORS and receipt links.
 *
 * Precedence is always:
 *   1. Explicit environment variable (still honoured when provided).
 *   2. Vercel-provided deployment host / incoming request origin.
 *
 * No host is hardcoded in source. When neither env nor request context can
 * resolve an origin, callers receive an empty string and report a clear
 * configuration error instead of silently redirecting to the wrong host.
 */

export interface UrlResolution {
  url?: string;
  error?: string;
}

const BKASH_CALLBACK_PATH = "/api/v1/payments/bkash/callback";
const NAGAD_CALLBACK_PATH = "/api/v1/payments/nagad/callback";
const GOOGLE_CALLBACK_PATH = "/api/v1/auth/google/callback";
const GOOGLE_SUCCESS_PATH = "/auth/callback";

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const normalizedCallbackWarnings = new Set<string>();

const warnNormalizedCallback = (configured: string, canonical: string): void => {
  if (configured === canonical || normalizedCallbackWarnings.has(canonical)) {
    return;
  }

  normalizedCallbackWarnings.add(canonical);
  console.warn(
    "[bkash] configured callback URL was normalized. Register this exact canonical URL with bKash:",
    { configured, canonical },
  );
};

const joinOrigin = (origin: string, path: string): string => {
  const cleanOrigin = clean(origin);
  // Never return a bare relative path: consumers treat these as absolute
  // redirect/callback URLs and a path would silently produce a broken redirect.
  return cleanOrigin ? `${cleanOrigin.replace(/\/+$/, "")}${path}` : "";
};

const isVercelHost = (host: string): boolean => {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
};

const isLocalHost = (host: string): boolean => {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
};

/** Only these origins may ever receive an auth/payment browser redirect. */
export const isSafeFrontendOrigin = (value: string | undefined): value is string => {
  const candidate = clean(value);

  if (!candidate) {
    return false;
  }

  try {
    const parsed = new URL(candidate);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    return isVercelHost(hostname) || isLocalHost(hostname);
  } catch {
    return false;
  }
};

interface OriginFromHostOptions {
  protocol?: "http" | "https";
  keepPort?: boolean;
}

const originFromHost = (
  value: string | undefined,
  { protocol = "https", keepPort = false }: OriginFromHostOptions = {},
): string | undefined => {
  const host = clean(value);

  if (!host) {
    return undefined;
  }

  if (host.includes("://")) {
    try {
      return new URL(host).origin;
    } catch {
      return undefined;
    }
  }

  const authority = host.split("/")[0] ?? "";
  if (!authority) {
    return undefined;
  }

  return `${protocol}://${keepPort ? authority : authority.replace(/:\d+$/, "")}`;
};

/** Public HTTPS origin of THIS backend. */
export const getBackendOrigin = (): string => {
  const explicit = clean(configuredEnv.PUBLIC_BASE_URL);

  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // env validation already rejects malformed URLs; fall through safely.
    }
  }

  if (env.VERCEL) {
    const vercelHost =
      clean(configuredEnv.VERCEL_BRANCH_URL) ?? clean(configuredEnv.VERCEL_URL);
    const derived = originFromHost(vercelHost);

    if (derived) {
      return derived;
    }
  }

  const hints = getRequestOriginHints();
  const requestHost = clean(hints?.host);

  if (requestHost) {
    if (env.VERCEL || isVercelHost(requestHost)) {
      const derived = originFromHost(requestHost);
      if (derived) {
        return derived;
      }
    } else if (env.isDevelopment || isLocalHost(requestHost)) {
      // Local/dev requests carry their real host (and port), so no hardcoded
      // development URL is needed.
      const derived = originFromHost(requestHost, {
        protocol: "http",
        keepPort: true,
      });
      if (derived) {
        return derived;
      }
    }
  }

  return "";
};

/** Origin of the Next.js storefront. Never derived from the backend Host. */
export const getFrontendOrigin = (): string => {
  // FRONTEND_URL is canonical; CLIENT_URL remains as a legacy alias.
  const explicit =
    clean(configuredEnv.FRONTEND_URL) ?? clean(configuredEnv.CLIENT_URL);

  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // env validation already rejects malformed URLs; fall through safely.
    }
  }

  const hints = getRequestOriginHints();
  const corsPatterns = configuredEnv.CORS_ORIGIN
    ? configuredEnv.CORS_ORIGIN.split(",").map((entry) => entry.trim())
    : [];

  for (const candidate of [hints?.origin, hints?.referer]) {
    const value = clean(candidate);

    if (!value) {
      continue;
    }

    try {
      const origin = new URL(value).origin;
      if (isSafeFrontendOrigin(origin) || isOriginAllowed(origin, corsPatterns)) {
        return origin;
      }
    } catch {
      // Ignore malformed browser headers.
    }
  }

  return "";
};

/** Google's registered redirect_uri for this backend. */
export const getGoogleCallbackUrl = (): string => {
  const explicit = clean(configuredEnv.GOOGLE_CALLBACK_URL);
  return explicit ?? joinOrigin(getBackendOrigin(), GOOGLE_CALLBACK_PATH);
};

/**
 * Browser destination after Google login. `frontendOrigin` can be carried in
 * the signed OAuth state so a top-level Google callback (which has no Origin
 * header) still lands on the storefront that started the flow.
 */
export const getGoogleSuccessRedirectUrl = (
  frontendOrigin?: string,
): string => {
  const explicit = clean(configuredEnv.GOOGLE_SUCCESS_REDIRECT_URL);

  if (explicit) {
    return explicit;
  }

  const base = isSafeFrontendOrigin(frontendOrigin)
    ? frontendOrigin
    : getFrontendOrigin();

  return joinOrigin(base, GOOGLE_SUCCESS_PATH);
};

/**
 * bKash registers a clean base merchant callback URL. bKash appends paymentID
 * and status itself, so no query string, hash or trailing slash is allowed.
 */
export const normalizeBkashCallbackUrl = (raw: string): UrlResolution => {
  // Some hosting providers inject quoted values; strip wrapping quotes before
  // any validation so a clean URL is never rejected (or sent with quotes).
  const value = raw.trim().replace(/^(["']+)|(["']+)$/g, "").trim();

  if (!value) {
    return { error: "BKASH_CALLBACK_URL is empty" };
  }

  if (/\s/.test(value)) {
    return {
      error: "BKASH_CALLBACK_URL contains whitespace. Use a single clean URL.",
    };
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return {
      error:
        "BKASH_CALLBACK_URL must be a full absolute URL (for example https://api.example.com/api/v1/payments/bkash/callback)",
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      error:
        "BKASH_CALLBACK_URL must use http or https (production requires https)",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      error: "BKASH_CALLBACK_URL must not contain credentials in the URL",
    };
  }

  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");

  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  if (parsed.pathname.toLowerCase() !== BKASH_CALLBACK_PATH) {
    return {
      error: `BKASH_CALLBACK_URL must point to ${BKASH_CALLBACK_PATH} (received ${parsed.pathname || "/"})`,
    };
  }

  if (env.isProduction) {
    if (parsed.protocol !== "https:") {
      return {
        error:
          "BKASH_CALLBACK_URL must use https in production. bKash rejects http merchant callback URLs.",
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (isLocalHost(hostname)) {
      return {
        error:
          "BKASH_CALLBACK_URL cannot use localhost in production. Use the public HTTPS URL of this backend.",
      };
    }
  }

  return { url: parsed.toString() };
};

export const resolveBkashCallbackUrl = (): UrlResolution => {
  const configured = clean(configuredEnv.BKASH_CALLBACK_URL);

  if (configured) {
    const resolution = normalizeBkashCallbackUrl(configured);

    if (resolution.url) {
      warnNormalizedCallback(configured, resolution.url);
    }

    return resolution;
  }

  const derived = joinOrigin(getBackendOrigin(), BKASH_CALLBACK_PATH);
  return normalizeBkashCallbackUrl(derived);
};

export const getBkashCallbackConfigError = (): string | undefined =>
  resolveBkashCallbackUrl().error;

/** Nagad merchant callback, also derivable from the active backend origin. */
export const getNagadCallbackUrl = (): string | undefined => {
  const explicit = clean(configuredEnv.NAGAD_CALLBACK_URL);
  const candidate = explicit ?? joinOrigin(getBackendOrigin(), NAGAD_CALLBACK_PATH);

  if (!candidate) {
    return undefined;
  }

  try {
    const parsed = new URL(candidate);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
};

/** Matches an incoming CORS origin against exact URLs and wildcard hosts. */
export const isOriginAllowed = (
  origin: string,
  patterns: readonly string[],
): boolean => {
  const target = clean(origin);

  if (!target) {
    return false;
  }

  let parsedTarget: URL;

  try {
    parsedTarget = new URL(target);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsedTarget.protocol)) {
    return false;
  }

  const targetOrigin = parsedTarget.origin.toLowerCase();
  const targetHostname = parsedTarget.hostname.toLowerCase();

  for (const entry of patterns) {
    const pattern = clean(entry);

    if (!pattern) {
      continue;
    }

    if (pattern === "*") {
      return true;
    }

    const wildcard = /^(https?):\/\/\*\.([^/]+)$/.exec(pattern);

    if (wildcard) {
      const [, scheme, suffix] = wildcard;
      const normalizedSuffix = suffix?.toLowerCase() ?? "";

      if (
        parsedTarget.protocol === `${scheme}:` &&
        normalizedSuffix &&
        (targetHostname === normalizedSuffix ||
          targetHostname.endsWith(`.${normalizedSuffix}`))
      ) {
        return true;
      }

      continue;
    }

    try {
      if (new URL(pattern).origin.toLowerCase() === targetOrigin) {
        return true;
      }
    } catch {
      // Invalid patterns are rejected by env validation.
    }
  }

  return false;
};
