import jwtModule from "jsonwebtoken";

/**
 * `jsonwebtoken` is a CommonJS package. Depending on the bundler and runtime,
 * its default import can be the module namespace, the callable module itself,
 * or an object with a nested `default`. Normalise it once so every consumer
 * gets the same API in both the bundled ESM and CJS builds.
 */
type JwtModule = typeof jwtModule;

const candidate = jwtModule as unknown as JwtModule & { default?: JwtModule };
const jwt: JwtModule = candidate?.default ?? candidate;

export default jwt;
export type { JwtPayload, SignOptions } from "jsonwebtoken";
