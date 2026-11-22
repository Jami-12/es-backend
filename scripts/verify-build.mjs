import { existsSync, readFileSync } from "node:fs";

// Guards against the Vercel ERR_MODULE_NOT_FOUND regression: bundled output
// must not contain relative import specifiers such as "../src/app".
const outputs = ["dist/api/index.js", "dist/server.js"];
const relativeSpecifier = /\b(?:from|import)\s*\(?\s*["'](\.[^"']*)["']/g;
const failures = [];

for (const file of outputs) {
  if (!existsSync(file)) {
    failures.push(`${file}: missing build output`);
    continue;
  }

  const code = readFileSync(file, "utf8");
  for (const match of code.matchAll(relativeSpecifier)) {
    failures.push(`${file}: ${match[0].trim()}`);
  }
}

if (failures.length > 0) {
  console.error("Build verification failed — relative ESM imports found:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log("Build verified: no relative ESM imports in bundled output.");
