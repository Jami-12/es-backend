import app from "./app";

/**
 * Bundled entry point for Vercel serverless functions.
 *
 * `tsup` bundles every local `src/` import into `dist/api/index.js`, so the
 * function only loads one self-contained file at runtime. npm dependencies
 * (for example `@prisma/client`) stay external and are installed by Vercel.
 */
export const handler = app;
export default app;
