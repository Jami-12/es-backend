import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    // Self-contained serverless bundle: all local src/ imports are inlined,
    // while npm dependencies remain external.
    "api/index": "src/vercel.ts",
  },
  format: ["esm", "cjs"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  outExtension: ({ format }) => ({
    js: format === "cjs" ? ".cjs" : ".js",
  }),
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  // Keep every node_modules import external (including @prisma/client).
  skipNodeModulesBundle: true,
  external: ["@prisma/client"],
});
