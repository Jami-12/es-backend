import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
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
});
