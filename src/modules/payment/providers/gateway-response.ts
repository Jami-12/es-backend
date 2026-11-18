import { ApiError } from "../../../utils/ApiError";
import { redactText } from "../../../utils/redact";

type JsonObject = Record<string, unknown>;

/** Payment gateways must answer quickly; hanging sockets must never stall a request. */
export const DEFAULT_GATEWAY_TIMEOUT_MS = 15_000;

export type GatewayBodyKind =
  | "empty"
  | "json-object"
  | "json-non-object"
  | "html"
  | "text"
  | "invalid-json"
  | "unreadable";

export interface GatewayResponseInfo {
  /** HTTP status code returned by the gateway. */
  httpStatus: number;
  httpOk: boolean;
  contentType: string | null;
  /** Character length of the body after decoding as UTF-8. */
  bodyLength: number;
  bodyKind: GatewayBodyKind;
  /** Strictly parsed JSON object, or an empty object when the body is not usable JSON. */
  data: JsonObject;
  /** True only when the body parsed as a JSON object without any repair. */
  isUsableJson: boolean;
  parseErrorMessage: string | null;
}

export interface GatewayLogContext {
  provider: string;
  operation: string;
}

export interface GatewayFetchOptions extends RequestInit {
  /** Human-readable provider name used in safe error messages and logs. */
  provider: string;
  /** Human-readable operation, for example "creating the payment". */
  operation: string;
  /** Hard deadline for the network request. Defaults to 15 seconds. */
  timeoutMs?: number;
}

/**
 * Wraps `fetch` with a hard timeout and converts low-level network failures
 * (DNS, TLS, refused connection, socket timeout) into controlled ApiErrors.
 *
 * Without this, a stalled gateway keeps the HTTP request open indefinitely and
 * a raw `TypeError: fetch failed` reaches the error middleware as a 500.
 */
export const gatewayFetch = async (
  url: string,
  options: GatewayFetchOptions,
): Promise<Response> => {
  const {
    provider,
    operation,
    timeoutMs = DEFAULT_GATEWAY_TIMEOUT_MS,
    signal: callerSignal,
    ...init
  } = options;

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortFromCaller = (): void => controller.abort();

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    // Only log the error class/name. Provider request URLs and headers can
    // contain identifiers, and error messages can contain fragments of both.
    const errorName = error instanceof Error ? error.name : "UnknownError";

    console.warn(`[payment-gateway] ${provider} ${operation} network failure`, {
      errorName,
      timedOut,
      abortedByCaller: Boolean(callerSignal?.aborted),
    });

    if (timedOut) {
      throw new ApiError(
        504,
        `${provider} did not respond in time while ${operation}. Please try again.`,
      );
    }

    throw new ApiError(
      502,
      `Could not reach ${provider} while ${operation}. Please try again.`,
    );
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
};

const isJsonContentType = (contentType: string | null): boolean => {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("application/json") ||
    normalized.includes("+json") ||
    normalized.includes("text/json")
  );
};

const escapeControlCharacters = (value: string): string =>
  value.replace(/[\u0000-\u001f\u007f]/g, (character) => {
    const code = character.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${code}`;
  });

/**
 * Produces a short diagnostic preview. It is only used for server logs and
 * never for a customer-facing response or a database write.
 */
const buildDiagnosticPreview = (body: string): string => {
  const preview = body.slice(0, 400);

  return escapeControlCharacters(
    redactText(preview)
      .replace(
        /("(?:id_token|refresh_token|access_token|token|authorization|password|secret|signature|sensitiveData|sensitive_data|client_secret|api_key)"\s*:\s*")[^"]*(")/gi,
        "$1[REDACTED]$2",
      )
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        "[REDACTED_JWT]",
      )
      .replace(/\b(?:sk|rk|pk|whsec)_[A-Za-z0-9_*]+/g, "[REDACTED_STRIPE_KEY]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"),
  );
};

/**
 * Reads a payment gateway response exactly once and parses it strictly.
 *
 * Gateways occasionally return HTML error pages, empty bodies, plain text or
 * malformed JSON with unescaped control characters. Calling `response.json()`
 * directly turns those cases into an opaque SyntaxError that aborts the
 * payment callback. This helper keeps the raw body intact and never repairs or
 * rewrites it; malformed bodies are reported as unusable so callers can fail
 * safely without changing the payment state.
 */
export const readGatewayResponse = async (
  response: Response,
  context: GatewayLogContext,
): Promise<GatewayResponseInfo> => {
  const contentType = response.headers.get("content-type");
  let body = "";
  let readErrorMessage: string | null = null;
  let bodyKind: GatewayBodyKind = "empty";
  let data: JsonObject = {};
  let parseErrorMessage: string | null = null;

  try {
    body = await response.text();
  } catch (error) {
    readErrorMessage =
      error instanceof Error ? error.message : "Response body could not be read";
    bodyKind = "unreadable";
  }

  if (bodyKind !== "unreadable") {
    const trimmed = body.trim();

    if (trimmed.length === 0) {
      bodyKind = "empty";
    } else if (
      contentType?.toLowerCase().includes("text/html") ||
      trimmed.startsWith("<")
    ) {
      bodyKind = "html";
    } else {
      try {
        const parsed: unknown = JSON.parse(body);

        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          bodyKind = "json-object";
          data = parsed as JsonObject;
        } else {
          // A JSON string/array/number is valid JSON, but not the object these
          // gateway endpoints promise. Do not parse a nested string as JSON:
          // that would be an unsafe attempt to repair the gateway response.
          bodyKind = "json-non-object";
        }
      } catch (error) {
        bodyKind = "invalid-json";
        parseErrorMessage =
          error instanceof Error ? error.message : "Invalid JSON response";
      }
    }
  }

  const info: GatewayResponseInfo = {
    httpStatus: response.status,
    httpOk: response.ok,
    contentType,
    bodyLength: body.length,
    bodyKind,
    data,
    isUsableJson: bodyKind === "json-object",
    parseErrorMessage: readErrorMessage ?? parseErrorMessage,
  };

  if (!info.httpOk || !info.isUsableJson) {
    console.warn(
      `[payment-gateway] ${context.provider} ${context.operation} returned an unusable response`,
      {
        httpStatus: info.httpStatus,
        contentType: info.contentType ?? "(missing)",
        jsonContentType: isJsonContentType(info.contentType),
        bodyLength: info.bodyLength,
        bodyKind: info.bodyKind,
        parseError: info.parseErrorMessage,
        preview: buildDiagnosticPreview(body),
      },
    );
  }

  return info;
};

export const gatewayErrorMessage = (
  data: JsonObject,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

export const unusableGatewayMessage = (
  info: GatewayResponseInfo,
  action: string,
): string =>
  info.httpOk
    ? `The payment gateway returned an unreadable response while ${action}. Please try again.`
    : `The payment gateway request failed with HTTP ${info.httpStatus} while ${action}. Please try again.`;
