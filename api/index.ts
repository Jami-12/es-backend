import app from "../src/app";

/**
 * Vercel serverless entrypoint.
 *
 * Top-level rewrites keep the original request path, so the Express app
 * receives "/" and "/api/v1/*" exactly as it does when running locally.
 * `app` is itself a valid Node request handler, so no extra adapter is needed.
 */
export const handler = app;

export default app;
