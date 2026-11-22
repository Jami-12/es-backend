// Vercel compiles this TypeScript shim to api/index.js and keeps the explicit
// `.js` specifier below. The actual handler is the tsup bundle produced by
// `npm run build`; all of its internal `src/` imports are already bundled in.
// @ts-ignore - dist/api/index.js is generated at build time
import app from "../dist/api/index.js";

/**
 * Vercel serverless entrypoint.
 *
 * Top-level rewrites keep the original request path, so the Express app
 * receives "/" and "/api/v1/*" exactly as it does when running locally.
 * `app` is itself a valid Node request handler, so no extra adapter is needed.
 */
export const handler = app;

export default app;
