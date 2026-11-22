import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request origin hints. Express installs these once at the top of the
 * middleware chain so deep service/provider code can resolve the active public
 * origin without threading `req` through every call signature.
 *
 * AsyncLocalStorage keeps concurrent Vercel invocations isolated.
 */
export interface RequestOriginHints {
  /** Incoming Host / X-Forwarded-Host (backend origin on Vercel). */
  host?: string;
  /** Browser Origin header (frontend origin on API calls). */
  origin?: string;
  /** Referer, used as a best-effort fallback when Origin is absent. */
  referer?: string;
}

const requestOriginStorage = new AsyncLocalStorage<RequestOriginHints>();

export const runWithRequestOriginHints = <T>(
  hints: RequestOriginHints,
  callback: () => T,
): T => requestOriginStorage.run(hints, callback);

export const getRequestOriginHints = (): RequestOriginHints | undefined =>
  requestOriginStorage.getStore();
